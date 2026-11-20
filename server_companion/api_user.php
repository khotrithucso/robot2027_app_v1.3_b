<?php
ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$userDir = __DIR__ . '/user_data';
$rtcDir  = $userDir . '/webrtc';
if (!is_dir($rtcDir)) @mkdir($rtcDir, 0777, true);

function outJson(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');
$post = json_decode($raw, true);
$req = is_array($post) ? array_merge($_GET, $post) : $_GET;

$action = $req['action'] ?? '';
$botId  = preg_replace('/[^a-zA-Z0-9_-]/', '', $req['bot_id'] ?? 'BOT_DEFAULT');
if ($botId === '') $botId = 'BOT_DEFAULT';

// 1. Nhận hàng đợi đồng bộ học tập & cảnh báo pin
if ($action === 'batch_sync') {
    $events = $req['events'] ?? [];
    if (is_array($events) && !empty($events)) {
        $logFile = "$userDir/{$botId}_events.ndjson";
        $lines = '';
        foreach ($events as $ev) {
            $lines .= json_encode($ev, JSON_UNESCAPED_UNICODE) . "
";
        }
        file_put_contents($logFile, $lines, FILE_APPEND | LOCK_EX);
    }
    outJson(['status' => 'ok', 'saved' => is_array($events) ? count($events) : 0]);
}

// 2. Trạm bắt tay WebRTC P2P (< 5KB, tự xóa sau 30s)
if ($action === 'webrtc_offer') {
    file_put_contents("$rtcDir/{$botId}_offer.json", json_encode([
        'sdp' => $req['sdp'] ?? null,
        'ts'  => time()
    ]));
    @unlink("$rtcDir/{$botId}_answer.json");
    outJson(['status' => 'ok']);
}

if ($action === 'webrtc_poll') {
    $offerFile = "$rtcDir/{$botId}_offer.json";
    if (!file_exists($offerFile)) outJson(['status' => 'idle']);
    $data = json_decode(file_get_contents($offerFile), true) ?: [];
    if (time() - ($data['ts'] ?? 0) > 30) {
        @unlink($offerFile);
        outJson(['status' => 'hangup']);
    }
    outJson(['status' => 'offer', 'sdp' => $data['sdp'] ?? null]);
}

if ($action === 'webrtc_answer') {
    file_put_contents("$rtcDir/{$botId}_answer.json", json_encode([
        'sdp' => $req['sdp'] ?? null,
        'ts'  => time()
    ]));
    @unlink("$rtcDir/{$botId}_offer.json");
    outJson(['status' => 'ok']);
}

if ($action === 'webrtc_get_answer') {
    $ansFile = "$rtcDir/{$botId}_answer.json";
    if (!file_exists($ansFile)) outJson(['status' => 'waiting']);
    $data = json_decode(file_get_contents($ansFile), true) ?: [];
    @unlink($ansFile);
    outJson(['status' => 'answer', 'sdp' => $data['sdp'] ?? null]);
}

outJson(['status' => 'error', 'message' => 'Action không hợp lệ'], 400);
