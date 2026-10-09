package com.ferrazcode.praiago.notifications;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.service.notification.StatusBarNotification;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.firebase.messaging.RemoteMessage;
import java.util.UUID;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class OrderProgressInstrumentedTest {
    private RemoteMessage event(String order, String kind) {
        return new RemoteMessage.Builder("test@praiago")
            .addData("event_id", UUID.randomUUID().toString())
            .addData("pedido_id", order)
            .addData("app", "cliente")
            .addData("kind", kind)
            .build();
    }

    @Test public void advancesOneNotificationWithoutRegressing() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        String order = UUID.randomUUID().toString();
        String tag = "pedido-" + order;
        try {
            OrderProgressNotification.show(context, event(order, "pagamento"));
            assertEquals("Pedido confirmado", titleFor(manager, tag));
            OrderProgressNotification.show(context, event(order, "preparando"));
            assertEquals("Seu pedido está em preparo", titleFor(manager, tag));
            OrderProgressNotification.show(context, event(order, "pagamento"));
            assertEquals("Seu pedido está em preparo", titleFor(manager, tag));
            OrderProgressNotification.show(context, event(order, "entregue"));
            assertEquals("Pedido entregue", titleFor(manager, tag));
        } finally {
            manager.cancel(tag, 1042);
        }
    }

    private String titleFor(NotificationManager manager, String tag) {
        int count = 0;
        String title = null;
        for (StatusBarNotification item : manager.getActiveNotifications()) {
            if (tag.equals(item.getTag())) {
                count++;
                Notification notification = item.getNotification();
                assertNotNull(notification.contentIntent);
                title = notification.extras.getString(Notification.EXTRA_TITLE);
            }
        }
        assertEquals(1, count);
        return title;
    }
}
