package io.github.marianarojaszuluaga.terminal;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.util.Collections;

/** This TV's address on the home network, for the QR code and the control's link. */
final class Net {
    private Net() {}

    /** The first private IPv4 address, preferring Wi-Fi and Ethernet (wlan, eth); null when offline. */
    static String ip() {
        String found = null;
        try {
            for (NetworkInterface n : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!n.isUp() || n.isLoopback()) continue;
                for (InetAddress a : Collections.list(n.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || !a.isSiteLocalAddress()) continue;
                    if (found == null || n.getName().startsWith("wlan") || n.getName().startsWith("eth")) found = a.getHostAddress();
                }
            }
        } catch (SocketException ignored) {
            // No network yet.
        }
        return found;
    }
}
