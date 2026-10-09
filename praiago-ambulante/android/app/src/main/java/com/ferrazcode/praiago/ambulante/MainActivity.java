package com.ferrazcode.praiago.ambulante;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import com.ferrazcode.praiago.notifications.PraiaGoNotificationsPlugin;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(PraiaGoNotificationsPlugin.class);
        super.onCreate(state);
        PraiaGoNotificationsPlugin.prepareChannels(this);
    }
}
