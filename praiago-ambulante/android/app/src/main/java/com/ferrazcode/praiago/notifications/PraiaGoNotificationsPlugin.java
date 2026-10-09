package com.ferrazcode.praiago.notifications;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PraiaGoNotifications")
public class PraiaGoNotificationsPlugin extends Plugin {
    private MediaPlayer player;
    private static AudioAttributes audio() {
        return new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
    }
    public static void prepareChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        create(manager, context, "novos_pedidos_praiago_v2", "Novos pedidos · PraiaGo", true, true, "novos_pedidos");
        create(manager, context, "atualizacoes_pedidos_praiago_v2", "Atualizações de pedidos · PraiaGo", true, true, "atualizacoes_pedidos");
        for (boolean sound : new boolean[]{false,true}) for (boolean vibration : new boolean[]{false,true}) {
            String id = "novidades_praiago_s"+(sound ? "1" : "0")+"_v"+(vibration ? "1" : "0");
            create(manager, context, id, "Novidades · "+(sound ? "com som" : "silenciosas")+(vibration ? " e vibração" : ""), sound, vibration, null);
        }
    }
    private static void create(NotificationManager manager, Context context, String id, String name, boolean sound, boolean vibration, String legacyId) {
        // Channels are immutable. Never delete/recreate one to bypass user settings.
        if (manager.getNotificationChannel(id) != null) return;
        NotificationChannel legacy = legacyId == null ? null : manager.getNotificationChannel(legacyId);
        int importance = legacy == null ? NotificationManager.IMPORTANCE_HIGH : legacy.getImportance();
        if (legacy != null && Build.VERSION.SDK_INT >= 29 && !legacy.hasUserSetImportance()) importance = NotificationManager.IMPORTANCE_HIGH;
        NotificationChannel channel = new NotificationChannel(id, name, importance);
        channel.setDescription(legacyId == null ? "Avisos opcionais do PraiaGo, autorizados no Perfil" : "Acompanhamento de pedidos no PraiaGo");
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PRIVATE);
        channel.enableVibration(legacy == null ? vibration : legacy.shouldVibrate());
        Uri uri = sound && (legacy == null || legacy.getSound() != null)
            ? Uri.parse("android.resource://"+context.getPackageName()+"/raw/praiago_pedido") : null;
        channel.setSound(uri, audio());
        if (legacy != null && Build.VERSION.SDK_INT >= 30 && legacy.hasUserSetSound()) channel.setSound(legacy.getSound(), legacy.getAudioAttributes());
        manager.createNotificationChannel(channel);
    }
    @PluginMethod public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            getActivity().startActivity(intent); call.resolve();
        } catch (Exception e) { call.reject("Não foi possível abrir as configurações do Android."); }
    }
    @PluginMethod public void previewSound(PluginCall call) {
        try {
            if (player != null) { player.release(); player = null; }
            int resource = getContext().getResources().getIdentifier("praiago_pedido", "raw", getContext().getPackageName());
            if (resource == 0) { call.reject("Atualize o aplicativo para ouvir o som PraiaGo."); return; }
            player = MediaPlayer.create(getContext(), resource, audio(), 0);
            if (player == null) { call.reject("Não foi possível reproduzir o som."); return; }
            player.setOnCompletionListener(done -> { done.release(); if (player == done) player = null; });
            player.start(); call.resolve();
        } catch (Exception e) { call.reject("Confira o volume de notificações do Android."); }
    }
    @Override protected void handleOnDestroy() {
        if (player != null) { player.release(); player = null; }
        super.handleOnDestroy();
    }
}
