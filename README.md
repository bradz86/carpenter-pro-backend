# Carpenter Pro Backend API

Backend API for Carpenter Pro - Material price tracking and project management application.

## Features

- Material price database with real-time updates
- Price scraping from major retailers (Home Depot, Lowe's, Menards)
- User custom pricing
- Price history tracking
- RESTful API endpoints
- PostgreSQL database
- Scheduled price updates (1st and 15th of each month)

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and configure
3. Install dependencies: `npm install`
4. Run migrations: `npm run migrate`
5. Start server: `npm start`

## Environment Variables

See `.env.example` for required configuration.

## API Endpoints

- `GET /health` - Health check
- `GET /api/materials` - Get all materials
- `POST /api/materials/custom-price` - Update custom price
- `GET /api/materials/:id/history` - Get price history
- `GET /api/materials/search` - Search materials
- `GET /api/materials/:id/retailer-prices` - Get retailer prices
- `POST /api/admin/scrape-prices` - Trigger manual price update (requires admin key)

## Deployment

This backend is configured for deployment on DigitalOcean App Platform using the included Dockerfile.
