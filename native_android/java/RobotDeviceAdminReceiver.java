package com.robot2027.companion;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;

public class RobotDeviceAdminReceiver extends DeviceAdminReceiver {
    @Override
    public void onEnabled(Context context, Intent intent) {
        super.onEnabled(context, intent);
    }
}
