package org.subbu.oauth.client;

import org.littleshoot.proxy.DefaultHttpProxyServer;
import org.littleshoot.proxy.HttpProxyServer;
import org.littleshoot.proxy.ProxyAuthorizationHandler;

public class OAuthForwardProxy {

  /**
   * Starts the proxy from the command line.
   *
   * @param args Any command line arguments.
   */
  public static void main(final String... args) {
    final int defaultPort = 8080;
    int port;
    if(args.length > 0) {
      final String arg = args[0];
      try {
        port = Integer.parseInt(arg);
      }
      catch(final NumberFormatException e) {
        port = defaultPort;
      }
    }
    else {
      port = defaultPort;
    }

    System.err.println("Starting the OAuth forward proxy server on port " + port);
    final HttpProxyServer server = new DefaultHttpProxyServer(port);

    ProxyAuthorizationHandler pah = new ProxyAuthorizationHandler() {
      @Override
      public boolean authenticate(String userName, String password) {
          // This proxy does not know about users. But it needs to know who the user is, so that it
          // can look up credentials.
          return true;
      }
    };
    server.addProxyAuthenticationHandler(pah);
    server.start();
    System.err.println("started");
  }
}
