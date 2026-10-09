package com.ferrazcode.praiago.notifications;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.BitmapFactory;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.ferrazcode.praiago.cliente.MainActivity;
import com.ferrazcode.praiago.cliente.R;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
import java.util.regex.Pattern;

/** One PraiaGo-branded, evolving notification per order. No ETA is invented here. */
final class OrderProgressNotification {
    private static final String CHANNEL = "atualizacoes_pedidos_praiago_v2";
    private static final String PREFS = "praiago-order-progress-v1";
    private static final int NOTIFICATION_ID = 1042;
    private static final int TEAL = 0xff007680;
    private static final int SAND = 0xffe8b848;
    private static final Pattern UUID = Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    static int stageFor(String kind) {
        if ("pagamento".equals(kind)) return 1;
        if ("preparando".equals(kind)) return 2;
        if ("saiu_entrega".equals(kind)) return 3;
        if ("entregue".equals(kind)) return 4;
        if ("cancelado".equals(kind)) return 5;
        return 0;
    }

    static boolean handles(RemoteMessage message) {
        Map<String, String> data = message.getData();
        String order = data.get("pedido_id");
        return message.getNotification() == null && "cliente".equals(data.get("app"))
            && order != null && UUID.matcher(order).matches()
            && stageFor(data.get("kind")) > 0;
    }

    static void show(Context context, RemoteMessage message) {
        if (!handles(message)) return;
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        Map<String, String> data = message.getData();
        String order = data.get("pedido_id");
        String kind = data.get("kind");
        int stage = stageFor(kind);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String key = "order-" + order;
        int previous = parseStage(prefs.getString(key, null));
        if (previous >= stage) return; // FCM can replay or deliver older events out of order.

        PraiaGoNotificationsPlugin.prepareChannels(context);
        Intent intent = new Intent(context, MainActivity.class)
            .setAction("com.ferrazcode.praiago.ORDER." + order)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("google.message_id", message.getMessageId() == null ? data.get("event_id") : message.getMessageId())
            .putExtra("event_id", data.get("event_id"))
            .putExtra("pedido_id", order)
            .putExtra("app", "cliente")
            .putExtra("kind", kind);
        PendingIntent open = PendingIntent.getActivity(context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String title;
        String detail;
        switch (stage) {
            case 1: title = "Pedido confirmado"; detail = "Recebemos seu pedido. Acompanhe as próximas etapas."; break;
            case 2: title = "Seu pedido está em preparo"; detail = "A loja está cuidando de tudo por aqui."; break;
            case 3: title = "Seu pedido está a caminho"; detail = "Fique de olho: a entrega já saiu."; break;
            case 4: title = "Pedido entregue"; detail = "Tudo pronto. Aproveite seu pedido!"; break;
            default: title = "Pedido cancelado"; detail = "Confira os detalhes e o pagamento no aplicativo.";
        }
        boolean cancelled = stage == 5;
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_praiago)
            .setLargeIcon(BitmapFactory.decodeResource(context.getResources(), R.drawable.praiago_notification_logo))
            .setColor(TEAL)
            .setContentTitle(title)
            .setContentText(detail)
            .setSubText(cancelled ? "PraiaGo · pedido cancelado" : "PraiaGo · etapa " + stage + " de 4")
            .setContentIntent(open)
            .setAutoCancel(true)
            // Each genuine transition may alert; duplicate/out-of-order FCM events are filtered above.
            .setOnlyAlertOnce(false)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setTimeoutAfter(cancelled || stage == 4 ? 6 * 60 * 60 * 1000L : 12 * 60 * 60 * 1000L)
            .setPublicVersion(new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_praiago)
                .setContentTitle("PraiaGo · atualização do pedido")
                .setContentText("Abra o app para acompanhar")
                .build());
        if (!cancelled) {
            if (Build.VERSION.SDK_INT >= 36) {
                NotificationCompat.ProgressStyle style = new NotificationCompat.ProgressStyle()
                    .setProgress(stage * 25)
                    .setStyledByProgress(true)
                    .addProgressSegment(new NotificationCompat.ProgressStyle.Segment(25).setColor(TEAL))
                    .addProgressSegment(new NotificationCompat.ProgressStyle.Segment(25).setColor(SAND))
                    .addProgressSegment(new NotificationCompat.ProgressStyle.Segment(25).setColor(TEAL))
                    .addProgressSegment(new NotificationCompat.ProgressStyle.Segment(25).setColor(SAND))
                    .addProgressPoint(new NotificationCompat.ProgressStyle.Point(25).setColor(TEAL))
                    .addProgressPoint(new NotificationCompat.ProgressStyle.Point(50).setColor(SAND))
                    .addProgressPoint(new NotificationCompat.ProgressStyle.Point(75).setColor(TEAL));
                builder.setStyle(style);
            } else {
                builder.setProgress(4, stage, false);
            }
        }
        try {
            NotificationManagerCompat.from(context).notify("pedido-" + order, NOTIFICATION_ID, builder.build());
            prefs.edit().putString(key, stage + ":" + System.currentTimeMillis()).apply();
            pruneOldEntries(prefs);
        } catch (SecurityException ignored) { /* Permission may be revoked after the check. */ }
    }

    private static int parseStage(String value) {
        if (value == null) return 0;
        int divider = value.indexOf(':');
        if (divider < 0) return 0;
        try { return Integer.parseInt(value.substring(0, divider)); }
        catch (NumberFormatException ignored) { return 0; }
    }

    private static void pruneOldEntries(SharedPreferences prefs) {
        Map<String, ?> all = prefs.getAll();
        if (all.size() <= 256) return;
        long cutoff = System.currentTimeMillis() - 30L * 24 * 60 * 60 * 1000;
        SharedPreferences.Editor editor = prefs.edit();
        for (Map.Entry<String, ?> entry : all.entrySet()) {
            String value = entry.getValue() instanceof String ? (String) entry.getValue() : "";
            int divider = value.indexOf(':');
            if (divider < 0) { editor.remove(entry.getKey()); continue; }
            try { if (Long.parseLong(value.substring(divider + 1)) < cutoff) editor.remove(entry.getKey()); }
            catch (NumberFormatException ignored) { editor.remove(entry.getKey()); }
        }
        editor.apply();
    }
}
