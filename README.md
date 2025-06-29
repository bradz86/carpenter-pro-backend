# Carpenter Pro Backend

Backend API for Carpenter Pro - Material price tracking and project management application.

## Features

- Material price database with real-time updates
- Price scraping from major retailers (Home Depot, Lowe's, Menards)
- User custom pricing
- Price history tracking
- RESTful API endpoints
- PostgreSQL database
- Scheduled price updates (1st and 15th of each month)

## Quick Deploy to DigitalOcean

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/bradz86/carpenter-pro-backend/tree/main)

## Local Development

1. Clone the repository
2. Copy `.env.example` to `.env` and configure
3. Install dependencies: `npm install`
4. Start server: `npm start`

The server will run on port 3000 by default.

## Testing

Run the test script to verify the server starts correctly:
```bash
chmod +x test-server.sh
./test-server.sh
```

## Environment Variables

```env
# Required
DATABASE_URL=postgresql://user:password@host:5432/dbname
NODE_ENV=production
PORT=3000

# Bright Data Configuration
BRIGHT_DATA_USERNAME=your_username
BRIGHT_DATA_PASSWORD=your_password

# Security
ADMIN_KEY=generate_secure_key
JWT_SECRET=generate_secure_key
```

## API Endpoints

### Health & Status
- `GET /` - API info and available endpoints
- `GET /health` - Health check endpoint

### Materials API
- `GET /api/materials` - Get all materials
- `POST /api/materials/custom-price` - Update custom price
- `GET /api/materials/:id/history` - Get price history
- `GET /api/materials/search?q=query` - Search materials
- `GET /api/materials/:id/retailer-prices` - Get retailer prices

### Admin API
- `POST /api/admin/scrape-prices` - Trigger manual price update (requires admin key)
- `GET /api/admin/scraping-status` - Get scraping status

## Deployment Notes

This backend is configured for deployment on DigitalOcean App Platform:

1. The server binds to `0.0.0.0:3000` for container compatibility
2. Health check endpoint is available at `/health`
3. Database SSL is enabled in production
4. Environment variables are managed through DigitalOcean

## Troubleshooting

### Port Issues
If you see "port 8081" errors, ensure:
- No Expo/React Native dependencies are installed
- The PORT environment variable is set to 3000
- The server.js file explicitly binds to the correct port

### Database Connection
- Ensure DATABASE_URL includes `?sslmode=require` for DigitalOcean
- Check that all required tables are created on startup

### Health Checks
The `/health` endpoint must return a 200 status code for deployment to succeed.

## License

MIT
