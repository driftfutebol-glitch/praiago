package com.ferrazcode.praiago.notifications;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.Bundle;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.ferrazcode.praiago.cliente.R;
import com.google.firebase.messaging.CommonNotificationBuilder;
import com.google.firebase.messaging.NotificationParams;
import com.google.firebase.messaging.RemoteMessage;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

// Enrich foreground rendering without replacing registration or native background FCM.
// The SDK and this renderer use the exact same tag/id; updates alert only once.
public class PraiaGoMessagingService extends MessagingService {
    private static final ThreadPoolExecutor images = new ThreadPoolExecutor(0, 2, 30, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(12), new ThreadPoolExecutor.DiscardPolicy());
    @Override public void onMessageReceived(@NonNull RemoteMessage message) {
        boolean bridgeActive = PushNotificationsPlugin.getPushNotificationsInstance() != null;
        super.onMessageReceived(message);
        if (OrderProgressNotification.handles(message)) {
            OrderProgressNotification.show(this, message);
            return;
        }
        if (!bridgeActive || message.getNotification() == null) return;
        String tag = message.getNotification().getTag();
        if (tag == null || !(tag.startsWith("pedido-") || tag.startsWith("campanha-"))) return;
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        try {
            Bundle metadata = getPackageManager().getApplicationInfo(getPackageName(), PackageManager.GET_META_DATA).metaData;
            if (metadata == null) metadata = new Bundle();
            NotificationParams params = new NotificationParams(message.toIntent().getExtras());
            String channel = CommonNotificationBuilder.getOrCreateChannel(this, params.getNotificationChannelId(), metadata);
            CommonNotificationBuilder.DisplayNotificationInfo info = CommonNotificationBuilder.createNotificationInfo(this, this, params, channel, metadata);
            // Referência estática: R8 precisa enxergar o recurso para incluí-lo no AAB.
            info.notificationBuilder.setLargeIcon(BitmapFactory.decodeResource(getResources(), R.drawable.praiago_notification_logo));
            info.notificationBuilder.setOnlyAlertOnce(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE);
            NotificationManagerCompat manager = NotificationManagerCompat.from(this);
            manager.notify(info.tag, info.id, info.notificationBuilder.build());
            if (message.getNotification().getImageUrl() != null) {
                String url = message.getNotification().getImageUrl().toString();
                images.execute(() -> {
                    Bitmap photo = download(url);
                    if (photo == null) return;
                    // Don't resurrect an alert the user already dismissed while downloading.
                    boolean stillVisible = false;
                    android.app.NotificationManager nativeManager = (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                    if (nativeManager != null) for (android.service.notification.StatusBarNotification current : nativeManager.getActiveNotifications()) {
                        if (info.id == current.getId() && info.tag.equals(current.getTag())) stillVisible = true;
                    }
                    if (!stillVisible) return;
                    info.notificationBuilder.setStyle(new NotificationCompat.BigPictureStyle().bigPicture(photo))
                        .setOnlyAlertOnce(true);
                    try {
                        manager.notify(info.tag, info.id, info.notificationBuilder.build());
                    } catch (SecurityException ignored) { /* Permission can be revoked during download. */ }
                });
            }
        } catch (Exception ignored) { /* Standard SDK notification remains intact. */ }
    }
    private Bitmap download(String url) {
        // Campaign photos are from the owned bucket only, no redirects or arbitrary hosts.
        if (!url.matches("^https://kfxpzjqktbcsxlqapkyv\\.supabase\\.co/storage/v1/object/public/push-campaign-media/[0-9a-f-]{36}/[0-9a-f-]{36}\\.(png|jpg|webp)$")) return null;
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(2000); connection.setReadTimeout(3000);
            if (connection.getResponseCode() != 200 || connection.getContentLengthLong() > 1048576) return null;
            String mime = connection.getContentType();
            if (mime == null || !mime.matches("image/(png|jpeg|webp)(;.*)?")) return null;
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (InputStream stream = connection.getInputStream()) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = stream.read(buffer)) != -1) {
                    if (bytes.size() + count > 1048576) return null;
                    bytes.write(buffer, 0, count);
                }
            }
            byte[] data = bytes.toByteArray();
            BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(data, 0, data.length, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth > 8192 || bounds.outHeight > 8192) return null;
            BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = 1;
            while (Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 1024) options.inSampleSize *= 2;
            return BitmapFactory.decodeByteArray(data, 0, data.length, options);
        } catch (Exception ignored) { return null; }
        finally { if (connection != null) connection.disconnect(); }
    }
}
