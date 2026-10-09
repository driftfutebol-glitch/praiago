package com.ferrazcode.praiago.notifications;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class OrderProgressNotificationTest {
    @Test public void mapsOnlySupportedOrderTransitions() {
        assertEquals(1, OrderProgressNotification.stageFor("pagamento"));
        assertEquals(2, OrderProgressNotification.stageFor("preparando"));
        assertEquals(3, OrderProgressNotification.stageFor("saiu_entrega"));
        assertEquals(4, OrderProgressNotification.stageFor("entregue"));
        assertEquals(5, OrderProgressNotification.stageFor("cancelado"));
        assertEquals(0, OrderProgressNotification.stageFor("novo"));
        assertEquals(0, OrderProgressNotification.stageFor("teste"));
        assertEquals(0, OrderProgressNotification.stageFor(null));
    }
}
