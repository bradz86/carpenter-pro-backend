const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Import price scraper
const PriceScraper = require('./src/services/priceScraper');
const priceScraper = new PriceScraper();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
});

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
async function initDatabase() {
  try {
    // Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS material_prices (
        id SERIAL PRIMARY KEY,
        category VARCHAR(100) NOT NULL,
        name VARCHAR(200) NOT NULL,
        unit VARCHAR(50) NOT NULL,
        price DECIMAL(10,2) DEFAULT 0,
        source VARCHAR(100),
        location VARCHAR(100) DEFAULT 'National Average',
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_custom_prices (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL,
        material_id INTEGER REFERENCES material_prices(id),
        custom_price DECIMAL(10,2),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, material_id)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS price_history (
        id SERIAL PRIMARY KEY,
        material_id INTEGER REFERENCES material_prices(id),
        price DECIMAL(10,2),
        source VARCHAR(100),
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS scraping_logs (
        id SERIAL PRIMARY KEY,
        status VARCHAR(50),
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        materials_updated INTEGER DEFAULT 0,
        errors TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS retailer_prices (
        id SERIAL PRIMARY KEY,
        material_id INTEGER REFERENCES material_prices(id),
        retailer VARCHAR(100),
        price DECIMAL(10,2),
        url TEXT,
        in_stock BOOLEAN DEFAULT true,
        last_scraped TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(material_id, retailer)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS price_alerts (
        id SERIAL PRIMARY KEY,
        material_id INTEGER REFERENCES material_prices(id),
        price_threshold DECIMAL(10,2),
        alert_type VARCHAR(20), -- 'above' or 'below'
        notified BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Routes

// Get all materials
app.get('/api/materials', async (req, res) => {
  try {
    const { category } = req.query;
    let query = `
      SELECT 
        mp.*,
        ucp.custom_price,
        ucp.user_id
      FROM material_prices mp
      LEFT JOIN user_custom_prices ucp ON mp.id = ucp.material_id AND ucp.user_id = $1
    `;
    
    const params = [req.headers['user-id'] || 'default'];
    
    if (category) {
      query += ' WHERE mp.category = $2';
      params.push(category);
    }
    
    query += ' ORDER BY mp.category, mp.name';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({ error: 'Failed to fetch materials' });
  }
});

// Update custom price
app.post('/api/materials/custom-price', async (req, res) => {
  try {
    const { userId, materialId, customPrice } = req.body;
    
    await pool.query(
      `INSERT INTO user_custom_prices (user_id, material_id, custom_price)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, material_id) 
       DO UPDATE SET custom_price = $3, created_at = CURRENT_TIMESTAMP`,
      [userId, materialId, customPrice]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating custom price:', error);
    res.status(500).json({ error: 'Failed to update price' });
  }
});

// Get price history
app.get('/api/materials/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT price, recorded_at 
       FROM price_history 
       WHERE material_id = $1 
       ORDER BY recorded_at DESC 
       LIMIT 30`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching price history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Search materials
app.get('/api/materials/search', async (req, res) => {
  try {
    const { q } = req.query;
    const result = await pool.query(
      `SELECT * FROM material_prices 
       WHERE LOWER(name) LIKE LOWER($1) 
       ORDER BY name 
       LIMIT 20`,
      [`%${q}%`]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error searching materials:', error);
    res.status(500).json({ error: 'Failed to search' });
  }
});

// Update material prices (for scraper)
app.post('/api/materials/batch-update', async (req, res) => {
  try {
    const { materials } = req.body;
    
    for (const material of materials) {
      // Update price
      const result = await pool.query(
        `INSERT INTO material_prices (category, name, unit, price, source)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name) 
         DO UPDATE SET price = $4, last_updated = CURRENT_TIMESTAMP
         RETURNING id`,
        [material.category, material.name, material.unit, material.price, material.source]
      );
      
      // Record price history
      if (result.rows[0]) {
        await pool.query(
          `INSERT INTO price_history (material_id, price) VALUES ($1, $2)`,
          [result.rows[0].id, material.price]
        );
      }
    }
    
    res.json({ success: true, updated: materials.length });
  } catch (error) {
    console.error('Error batch updating materials:', error);
    res.status(500).json({ error: 'Failed to update materials' });
  }
});

// Get retailer prices for a material
app.get('/api/materials/:id/retailer-prices', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT retailer, price, url, in_stock, last_scraped
      FROM retailer_prices
      WHERE material_id = $1
      ORDER BY price ASC
    `, [id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching retailer prices:', error);
    res.status(500).json({ error: 'Failed to fetch retailer prices' });
  }
});

// Get price alerts
app.get('/api/price-alerts', async (req, res) => {
  try {
    const { userId } = req.headers;
    const result = await pool.query(`
      SELECT pa.*, mp.name as material_name, mp.category
      FROM price_alerts pa
      JOIN material_prices mp ON pa.material_id = mp.id
      WHERE pa.notified = false
      ORDER BY pa.created_at DESC
      LIMIT 50
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching price alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Trigger manual price update
app.post('/api/admin/scrape-prices', async (req, res) => {
  try {
    // Verify admin authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_KEY}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Start scraping in background
    const scrapingId = await logScrapingStart();
    
    priceScraper.scrapeAllPrices()
      .then(result => logScrapingComplete(scrapingId, result))
      .catch(error => logScrapingError(scrapingId, error));
    
    res.json({ message: 'Price scraping started', scrapingId });
  } catch (error) {
    console.error('Error starting price scrape:', error);
    res.status(500).json({ error: 'Failed to start scraping' });
  }
});

// Get scraping status
app.get('/api/admin/scraping-status', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM scraping_logs
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching scraping status:', error);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// Helper functions for logging
async function logScrapingStart() {
  const result = await pool.query(`
    INSERT INTO scraping_logs (status, started_at)
    VALUES ('running', CURRENT_TIMESTAMP)
    RETURNING id
  `);
  return result.rows[0].id;
}

async function logScrapingComplete(id, result) {
  await pool.query(`
    UPDATE scraping_logs
    SET status = $1,
        materials_updated = $2,
        completed_at = CURRENT_TIMESTAMP
    WHERE id = $3
  `, [result.success ? 'completed' : 'failed', result.updated || 0, id]);
}

async function logScrapingError(id, error) {
  await pool.query(`
    UPDATE scraping_logs
    SET status = 'failed',
        errors = $1,
        completed_at = CURRENT_TIMESTAMP
    WHERE id = $2
  `, [error.message, id]);
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// Schedule price updates (runs on the 1st and 15th of each month at 2 AM)
cron.schedule('0 2 1,15 * *', async () => {
  console.log('Running scheduled price update...');
  const scrapingId = await logScrapingStart();
  
  try {
    const result = await priceScraper.scrapeAllPrices();
    await logScrapingComplete(scrapingId, result);
  } catch (error) {
    await logScrapingError(scrapingId, error);
  }
});

// Start server
app.listen(port, '0.0.0.0', async () => {
  console.log(`Server running on port ${port}`);
  await initDatabase();
  
  // Insert default materials if table is empty
  const count = await pool.query('SELECT COUNT(*) FROM material_prices');
  if (count.rows[0].count === '0') {
    console.log('Inserting default materials...');
    const defaultMaterials = [
      { category: 'Lumber', name: '2x4x8 Stud', unit: 'each', price: 5.98 },
      { category: 'Lumber', name: '2x6x8', unit: 'each', price: 8.97 },
      { category: 'Lumber', name: '2x8x10', unit: 'each', price: 13.45 },
      { category: 'Lumber', name: '2x10x12', unit: 'each', price: 22.97 },
      { category: 'Lumber', name: '4x4x8 Post', unit: 'each', price: 19.98 },
      { category: 'Lumber', name: 'OSB 7/16" 4x8', unit: 'sheet', price: 14.97 },
      { category: 'Lumber', name: 'Plywood 1/2" 4x8', unit: 'sheet', price: 32.97 },
      { category: 'Concrete', name: '80lb Concrete Bag', unit: 'bag', price: 8.99 },
      { category: 'Concrete', name: 'Ready Mix (per yard)', unit: 'cubic yard', price: 125.00 },
      { category: 'Drywall', name: '1/2" Drywall 4x8', unit: 'sheet', price: 13.98 },
      { category: 'Drywall', name: 'Joint Compound 5gal', unit: 'bucket', price: 17.98 },
      { category: 'Drywall', name: 'Drywall Tape 250ft', unit: 'roll', price: 6.98 },
      { category: 'Roofing', name: 'Architectural Shingles', unit: 'bundle', price: 39.98 },
      { category: 'Roofing', name: '15lb Felt Paper', unit: 'roll', price: 29.98 },
      { category: 'Fasteners', name: '16d Framing Nails 50lb', unit: 'box', price: 65.00 },
      { category: 'Fasteners', name: 'Drywall Screws 5lb', unit: 'box', price: 29.98 },
      { category: 'Insulation', name: 'R-13 Fiberglass 15"', unit: 'roll', price: 45.98 },
      { category: 'Insulation', name: 'R-19 Fiberglass 15"', unit: 'roll', price: 62.98 },
    ];
    
    for (const material of defaultMaterials) {
      await pool.query(
        `INSERT INTO material_prices (category, name, unit, price, source)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name) DO NOTHING`,
        [material.category, material.name, material.unit, material.price, 'default']
      );
    }
    console.log('Default materials inserted');
  }
});
