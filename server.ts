import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

interface TrackingLink {
  id: string;
  token: string;
  order_id: string;
  rider_id: string;
  customer_id: string;
  address: string;
  status: 'active' | 'delivered' | 'expired';
  created_at: string;
  expires_at: string;
}

interface LocationUpdate {
  order_id: string;
  latitude: number;
  longitude: number;
  updated_at: string;
}

interface DatabaseSchema {
  tracking_links: TrackingLink[];
  location_updates: Record<string, LocationUpdate>;
}

const DB_FILE = path.join(process.cwd(), "db.json");

// Helper to load DB
function loadDB(): DatabaseSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error loading db.json, resetting...", err);
  }

  // Default seed data
  const now = new Date();
  const seedLinks: TrackingLink[] = [
    {
      id: "order-101-uuid",
      token: "demo-token-active",
      order_id: "ORD-9843",
      rider_id: "Rider-John",
      customer_id: "Cust-Sarah",
      address: "10 Marina Boulevard, Marina Bay, Singapore 018983",
      status: "active",
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(), // 3 hours from now
    },
    {
      id: "order-102-uuid",
      token: "demo-token-delivered",
      order_id: "ORD-4512",
      rider_id: "Rider-Mike",
      customer_id: "Cust-Alice",
      address: "21 Orchard Road, Singapore 238888",
      status: "delivered",
      created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(now.getTime() + 1 * 60 * 60 * 1000).toISOString(),
    }
  ];

  const seedLocations: Record<string, LocationUpdate> = {
    "ORD-9843": {
      order_id: "ORD-9843",
      latitude: 1.29027, // Center of Singapore / standard starting lat
      longitude: 103.851959,
      updated_at: now.toISOString(),
    }
  };

  const initialDB: DatabaseSchema = {
    tracking_links: seedLinks,
    location_updates: seedLocations,
  };

  saveDB(initialDB);
  return initialDB;
}

// Helper to save DB
function saveDB(db: DatabaseSchema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving db.json", err);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize DB
  let db = loadDB();

  // Active SSE Clients dictionary: key is token, value is list of express Response objects
  const sseClients: Record<string, express.Response[]> = {};

  // Background cron to expire tracking links every 10 seconds
  setInterval(() => {
    const now = new Date();
    let modified = false;
    db.tracking_links.forEach((link) => {
      if (link.status === "active" && new Date(link.expires_at) < now) {
        link.status = "expired";
        modified = true;
        console.log(`Tracking token ${link.token} (Order ${link.order_id}) has expired.`);
        // Broadcast completion/expiration to client
        broadcastToSSE(link.token, { type: "status_change", status: "expired" });
      }
    });
    if (modified) {
      saveDB(db);
    }
  }, 10000);

  // Helper to generate a random hex string
  function generateRandomToken(): string {
    const chars = "abcdef0123456789";
    let token = "";
    for (let i = 0; i < 32; i++) {
      token += chars[Math.floor(Math.random() * chars.length)];
    }
    return token;
  }

  // Broadcast helper
  function broadcastToSSE(token: string, data: any) {
    const clients = sseClients[token];
    if (clients && clients.length > 0) {
      clients.forEach((res) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      });
    }
  }

  // API 1: Create tracking link
  app.post("/api/orders", (req, res) => {
    const { order_id, rider_id, customer_id, address } = req.body;
    if (!order_id || !rider_id || !customer_id || !address) {
       res.status(400).json({ error: "Missing required fields" });
       return;
    }

    const now = new Date();
    const expires_at = new Date(now.getTime() + 3 * 60 * 60 * 1000); // 3 hours

    const newLink: TrackingLink = {
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      token: generateRandomToken(),
      order_id: String(order_id).trim(),
      rider_id: String(rider_id).trim(),
      customer_id: String(customer_id).trim(),
      address: String(address).trim(),
      status: "active",
      created_at: now.toISOString(),
      expires_at: expires_at.toISOString(),
    };

    db.tracking_links.push(newLink);
    saveDB(db);

    res.status(201).json(newLink);
  });

  // API 2: Get all orders (for list/dashboard testing)
  app.get("/api/orders", (req, res) => {
    const enrichedOrders = db.tracking_links.map((link) => {
      const loc = db.location_updates[link.order_id] || null;
      return {
        ...link,
        location: loc,
      };
    });
    res.json(enrichedOrders);
  });

  // API 3: Get tracking link details by token
  app.get("/api/tracking/:token", (req, res) => {
    const { token } = req.params;
    const link = db.tracking_links.find((l) => l.token === token);

    if (!link) {
      res.status(404).json({ error: "Tracking link not found" });
      return;
    }

    const now = new Date();
    // Check if expired on demand
    if (link.status === "active" && new Date(link.expires_at) < now) {
      link.status = "expired";
      saveDB(db);
    }

    const location = db.location_updates[link.order_id] || null;
    res.json({
      link,
      location,
    });
  });

  // API 4: Post location update (Rider GPS)
  app.post("/api/tracking/:token/location", (req, res) => {
    const { token } = req.params;
    const { latitude, longitude } = req.body;

    if (latitude === undefined || longitude === undefined) {
      res.status(400).json({ error: "Missing coordinates" });
      return;
    }

    const link = db.tracking_links.find((l) => l.token === token);
    if (!link) {
      res.status(404).json({ error: "Tracking link not found" });
      return;
    }

    const now = new Date();
    // Validate if status is active (security condition)
    if (link.status !== "active" || new Date(link.expires_at) < now) {
      res.status(403).json({ error: "Cannot write to a completed or expired tracking link" });
      return;
    }

    // Upsert into location_updates
    const update: LocationUpdate = {
      order_id: link.order_id,
      latitude: Number(latitude),
      longitude: Number(longitude),
      updated_at: now.toISOString(),
    };

    db.location_updates[link.order_id] = update;
    saveDB(db);

    // Broadcast location update via SSE to subscribed customers
    broadcastToSSE(token, { type: "location_update", location: update });

    res.json({ success: true, location: update });
  });

  // API 5: Complete delivery (Either Rider or Customer clicks delivered)
  app.post("/api/tracking/:token/complete", (req, res) => {
    const { token } = req.params;
    const link = db.tracking_links.find((l) => l.token === token);

    if (!link) {
      res.status(404).json({ error: "Tracking link not found" });
      return;
    }

    link.status = "delivered";
    saveDB(db);

    // Broadcast status change to clients
    broadcastToSSE(token, { type: "status_change", status: "delivered" });

    res.json({ success: true, link });
  });

  // API 6: Server-Sent Events (SSE) Stream for real-time customer tracking
  app.get("/api/tracking/:token/stream", (req, res) => {
    const { token } = req.params;
    const link = db.tracking_links.find((l) => l.token === token);

    if (!link) {
      res.status(404).json({ error: "Tracking link not found" });
      return;
    }

    // Setup SSE Headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Initial message with active status and current location
    const initialLocation = db.location_updates[link.order_id] || null;
    res.write(`data: ${JSON.stringify({ type: "init", status: link.status, location: initialLocation })}\n\n`);

    // Add to active clients
    if (!sseClients[token]) {
      sseClients[token] = [];
    }
    sseClients[token].push(res);

    // Heartbeat to keep connection alive (every 25s)
    const heartbeatInterval = setInterval(() => {
      res.write(`: ping\n\n`);
    }, 25000);

    // Remove client on connection close
    req.on("close", () => {
      clearInterval(heartbeatInterval);
      if (sseClients[token]) {
        sseClients[token] = sseClients[token].filter((client) => client !== res);
        if (sseClients[token].length === 0) {
          delete sseClients[token];
        }
      }
    });
  });

  // Vite Integration for dev or production
  const distPath = path.join(process.cwd(), "dist");
  const isProd = process.env.NODE_ENV === "production" || fs.existsSync(path.join(distPath, "index.html"));

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Fallback for SPA routing in development mode (using Vite transforms)
    app.get("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const templatePath = path.resolve(process.cwd(), "index.html");
        let template = fs.readFileSync(templatePath, "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        next(e);
      }
    });
  } else {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
