import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * Workplace Safety Sentinel - ABCD Java Backend Server
 * Serves static HTML/CSS/JS frontend and provides REST API endpoints for telemetry and incident logging.
 * Pure Java (SE 8+) with zero external dependencies.
 */
public class BackendServer {

    private static final int PORT = 8080;

    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
        System.out.println("=============================================================");
        System.out.println(" WORKPLACE SAFETY SENTINEL - JAVA BACKEND SERVER (ABCD)");
        System.out.println("=============================================================");
        System.out.println("[*] Server listening at: http://localhost:" + PORT);
        System.out.println("[*] Serving HTML5, CSS3, JavaScript frontend and REST APIs.");
        System.out.println("=============================================================");

        // Handlers
        server.createContext("/", new StaticFileHandler());
        server.createContext("/api/status", new StatusApiHandler());
        server.createContext("/api/incidents", new IncidentsApiHandler());

        server.setExecutor(null);
        server.start();
    }

    /**
     * Serves static HTML, CSS, JS files.
     */
    static class StaticFileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String path = exchange.getRequestURI().getPath();
            if (path == null || path.equals("/") || path.isEmpty()) {
                path = "/index.html";
            }

            File file = new File("." + path);
            if (!file.exists() || file.isDirectory()) {
                file = new File("abcd" + path);
            }

            if (!file.exists()) {
                String response = "404 Not Found: " + path;
                exchange.sendResponseHeaders(404, response.length());
                OutputStream os = exchange.getResponseBody();
                os.write(response.getBytes());
                os.close();
                return;
            }

            String contentType = "text/plain";
            if (path.endsWith(".html")) contentType = "text/html";
            else if (path.endsWith(".css")) contentType = "text/css";
            else if (path.endsWith(".js")) contentType = "application/javascript";
            else if (path.endsWith(".json")) contentType = "application/json";

            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(200, file.length());

            OutputStream os = exchange.getResponseBody();
            try (FileInputStream fis = new FileInputStream(file)) {
                byte[] buffer = new byte[4096];
                int bytesRead;
                while ((bytesRead = fis.read(buffer)) != -1) {
                    os.write(buffer, 0, bytesRead);
                }
            }
            os.close();
        }
    }

    /**
     * REST API: /api/status
     */
    static class StatusApiHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String json = "{\n" +
                    "  \"system\": \"Workplace Safety Sentinel ABCD\",\n" +
                    "  \"status\": \"NOMINAL\",\n" +
                    "  \"zero_masking\": true,\n" +
                    "  \"timestamp\": \"" + LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME) + "\",\n" +
                    "  \"active_tracks\": [\"ID #1: Safe Box\", \"ID #2: Transit Corridor\"]\n" +
                    "}";

            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            OutputStream os = exchange.getResponseBody();
            os.write(bytes);
            os.close();
        }
    }

    /**
     * REST API: /api/incidents
     */
    static class IncidentsApiHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String json = "[\n" +
                    "  {\n" +
                    "    \"timestamp\": \"" + LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME) + "\",\n" +
                    "    \"event_type\": \"BREACH_VERIFIED\",\n" +
                    "    \"track_id\": 2,\n" +
                    "    \"zone\": \"DANGER: Machinery Cell\",\n" +
                    "    \"status\": \"Resolved via Zero-Masking Isolation\"\n" +
                    "  }\n" +
                    "]";

            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            OutputStream os = exchange.getResponseBody();
            os.write(bytes);
            os.close();
        }
    }
}
