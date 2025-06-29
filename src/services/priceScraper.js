const axios = require('axios');
const cron = require('node-cron');
const { Pool } = require('pg');
require('dotenv').config();

class PriceScraper {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
      } : false
    });
    
    // Bright Data configuration
    this.brightDataConfig = {
      username: process.env.BRIGHT_DATA_USERNAME,
      password: process.env.BRIGHT_DATA_PASSWORD,
      zone: process.env.BRIGHT_DATA_ZONE || 'static',
      country: 'us'
    };
  }

  // Scrape Home Depot prices
  async scrapeHomeDepot(materials) {
    const results = [];
    
    for (const material of materials) {
      try {
        const searchQuery = encodeURIComponent(material.name);
        const url = `https://www.homedepot.com/s/${searchQuery}`;
        
        // Use Bright Data proxy
        const response = await axios.get(url, {
          proxy: {
            host: 'brd.superproxy.io',
            port: 22225,
            auth: {
              username: `${this.brightDataConfig.username}-zone-${this.brightDataConfig.zone}`,
              password: this.brightDataConfig.password
            }
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          }
        });
        
        // Parse HTML and extract price
        const price = this.extractHomeDepotPrice(response.data, material);
        
        if (price) {
          results.push({
            materialId: material.id,
            name: material.name,
            price: price,
            source: 'Home Depot',
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error(`Error scraping Home Depot for ${material.name}:`, error.message);
      }
    }
    
    return results;
  }

  // Scrape Lowe's prices
  async scrapeLowes(materials) {
    const results = [];
    
    for (const material of materials) {
      try {
        const searchQuery = encodeURIComponent(material.name);
        const url = `https://www.lowes.com/search?searchTerm=${searchQuery}`;
        
        const response = await axios.get(url, {
          proxy: {
            host: 'brd.superproxy.io',
            port: 22225,
            auth: {
              username: `${this.brightDataConfig.username}-zone-${this.brightDataConfig.zone}`,
              password: this.brightDataConfig.password
            }
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          }
        });
        
        const price = this.extractLowesPrice(response.data, material);
        
        if (price) {
          results.push({
            materialId: material.id,
            name: material.name,
            price: price,
            source: "Lowe's",
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error(`Error scraping Lowe's for ${material.name}:`, error.message);
      }
    }
    
    return results;
  }

  // Scrape Menards prices
  async scrapeMenards(materials) {
    const results = [];
    
    for (const material of materials) {
      try {
        const searchQuery = encodeURIComponent(material.name);
        const url = `https://www.menards.com/main/search.html?search=${searchQuery}`;
        
        const response = await axios.get(url, {
          proxy: {
            host: 'brd.superproxy.io',
            port: 22225,
            auth: {
              username: `${this.brightDataConfig.username}-zone-${this.brightDataConfig.zone}`,
              password: this.brightDataConfig.password
            }
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          }
        });
        
        const price = this.extractMenardsPrice(response.data, material);
        
        if (price) {
          results.push({
            materialId: material.id,
            name: material.name,
            price: price,
            source: 'Menards',
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error(`Error scraping Menards for ${material.name}:`, error.message);
      }
    }
    
    return results;
  }

  // Extract price from Home Depot HTML
  extractHomeDepotPrice(html, material) {
    // Use regex to find price patterns
    const priceRegex = /\$(\d+\.?\d*)/;
    const matches = html.match(priceRegex);
    
    if (matches && matches[1]) {
      return parseFloat(matches[1]);
    }
    
    return null;
  }

  // Extract price from Lowe's HTML
  extractLowesPrice(html, material) {
    const priceRegex = /\$(\d+\.?\d*)/;
    const matches = html.match(priceRegex);
    
    if (matches && matches[1]) {
      return parseFloat(matches[1]);
    }
    
    return null;
  }

  // Extract price from Menards HTML
  extractMenardsPrice(html, material) {
    const priceRegex = /\$(\d+\.?\d*)/;
    const matches = html.match(priceRegex);
    
    if (matches && matches[1]) {
      return parseFloat(matches[1]);
    }
    
    return null;
  }

  // Update database with scraped prices
  async updatePrices(priceData) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const item of priceData) {
        // Update material price
        await client.query(`
          UPDATE material_prices 
          SET price = $1, 
              source = $2, 
              last_updated = CURRENT_TIMESTAMP 
          WHERE id = $3
        `, [item.price, item.source, item.materialId]);
        
        // Insert into price history
        await client.query(`
          INSERT INTO price_history (material_id, price, source, recorded_at)
          VALUES ($1, $2, $3, $4)
        `, [item.materialId, item.price, item.source, item.timestamp]);
        
        // Insert into retailer prices
        await client.query(`
          INSERT INTO retailer_prices (material_id, retailer, price, last_scraped)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (material_id, retailer) 
          DO UPDATE SET price = $3, last_scraped = $4
        `, [item.materialId, item.source, item.price, item.timestamp]);
      }
      
      await client.query('COMMIT');
      console.log(`Updated ${priceData.length} prices successfully`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating prices:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Main scraping function
  async scrapeAllPrices() {
    console.log('Starting price scraping...');
    
    try {
      // Get all materials from database
      const materialsResult = await this.pool.query(
        'SELECT id, name, category FROM material_prices'
      );
      const materials = materialsResult.rows;
      
      // Scrape from each retailer
      const homeDepotPrices = await this.scrapeHomeDepot(materials);
      const lowesPrices = await this.scrapeLowes(materials);
      const menardsPrices = await this.scrapeMenards(materials);
      
      // Combine all prices
      const allPrices = [...homeDepotPrices, ...lowesPrices, ...menardsPrices];
      
      // Calculate average prices for each material
      const averagePrices = this.calculateAveragePrices(allPrices);
      
      // Update database
      await this.updatePrices(averagePrices);
      
      // Send notification if significant price changes
      await this.checkPriceChanges(averagePrices);
      
      console.log('Price scraping completed successfully');
      return { success: true, updated: averagePrices.length };
      
    } catch (error) {
      console.error('Price scraping failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Calculate average prices from multiple sources
  calculateAveragePrices(allPrices) {
    const priceMap = new Map();
    
    // Group prices by material ID
    allPrices.forEach(item => {
      if (!priceMap.has(item.materialId)) {
        priceMap.set(item.materialId, []);
      }
      priceMap.get(item.materialId).push(item);
    });
    
    // Calculate averages
    const averages = [];
    priceMap.forEach((prices, materialId) => {
      const sum = prices.reduce((acc, p) => acc + p.price, 0);
      const average = sum / prices.length;
      
      averages.push({
        materialId,
        price: Math.round(average * 100) / 100,
        source: 'Average',
        timestamp: new Date()
      });
    });
    
    return averages;
  }

  // Check for significant price changes
  async checkPriceChanges(newPrices) {
    const threshold = 0.15; // 15% change threshold
    
    for (const newPrice of newPrices) {
      // Get previous price
      const prevResult = await this.pool.query(`
        SELECT price FROM material_prices WHERE id = $1
      `, [newPrice.materialId]);
      
      if (prevResult.rows.length > 0) {
        const prevPrice = prevResult.rows[0].price;
        const changePercent = Math.abs((newPrice.price - prevPrice) / prevPrice);
        
        if (changePercent > threshold) {
          // Record significant price change
          console.log(`Significant price change detected for material ${newPrice.materialId}: ${changePercent * 100}%`);
        }
      }
    }
  }
}

module.exports = PriceScraper;
