# Tube Visibility Inspector

A web application for analyzing YouTube video visibility, status, and metadata. Built with React, TypeScript, and Supabase, this tool helps content creators and researchers understand the current state of YouTube videos and channels.

I made this to analyze YouTube URL lists I have.

## Features

### 🎯 Core Functionality

- **Video Status Checking**: Check if YouTube videos are public, unlisted, private, or deleted
- **Channel Scanning**: Analyze entire YouTube channels for video visibility
- **Batch Processing**: Process multiple videos simultaneously
- **Caching System**: Intelligent caching to reduce API calls and improve performance
- **Multiple Input Methods**: Support for URLs, text input, file uploads, and clipboard pasting

### 📊 Analysis Tools

- **Status Filtering**: Filter videos by visibility status (public, unlisted, private, deleted)
- **Content Type Detection**: Automatically identify videos vs. shorts
- **Export Options**: Export results in TXT or JSON formats
- **Real-time Statistics**: View counts and summaries of video statuses
- **Thumbnail Preview**: See video thumbnails when available

### 🛠 Technical Features

- **Responsive Design**: Works on desktop and mobile devices
- **Modern UI**: Built with shadcn/ui components and Tailwind CSS 4
- **TypeScript**: Full type safety throughout the application
- **Supabase Integration**: Backend powered by Supabase Edge Functions
- **YouTube API Integration**: Uses official YouTube Data API v3 with web scraping fallback

## Quick Start

### Prerequisites

- Node.js 18+ or Bun
- Supabase account
- YouTube Data API key

### Installation

1. **Clone and install**
   ```bash
   git clone https://github.com/jonasfroeller/tube-visibility-inspector.git
   cd tube-visibility-inspector
   npm install
   ```

2. **Set up Supabase**
   - Create a new Supabase project
   - Run the migration in `supabase/migrations/`
   - Deploy the Edge Function in `supabase/functions/check-youtube-status/`

3. **Configure environment**
   Create `.env`:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Set Supabase secrets**
   ```env
   YOUTUBE_API_KEY=your_youtube_api_key
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

5. **Start development**
   ```bash
   npm run dev
   ```

## Usage

### Individual Videos

1. Paste YouTube URLs in the text area
2. Click "Check Videos" to process them
3. View results with status indicators and metadata

### Channel Analysis

1. Enter a YouTube channel URL or username
2. Click "Scan Channel" to analyze all videos
3. Filter and export results as needed

### Batch Processing

- **File Upload**: Upload a text file with one URL per line
- **Clipboard**: Paste multiple URLs from clipboard
- **Manual Input**: Type or paste URLs directly

### Export Options

- **TXT Export**: Simple list of URLs by status
- **JSON Export**: Detailed metadata for all videos
- **Filtered Export**: Export only videos matching specific criteria

## 🛠 Tech Stack

| Frontend              | Backend                 | Tools      |
| --------------------- | ----------------------- | ---------- |
| React 18 + TypeScript | Supabase Edge Functions | ESLint     |
| Vite                  | YouTube Data API v3     | TypeScript |
| Tailwind CSS 4        | Supabase Database       | PostCSS    |
| shadcn/ui             | Web Scraping (fallback) | -          |
| React Router          | -                       | -          |
| React Query           | -                       | -          |

## API Reference

### Supabase Edge Function: `check-youtube-status`

**Endpoint**: `POST /functions/v1/check-youtube-status`

**Request Body**:
```typescript
{
  videoIds?: string[],        // Array of YouTube video IDs
  channelUrl?: string,        // YouTube channel URL or username
  ignoreCache?: boolean       // Skip cache and fetch fresh data
}
```

**Response**:
```typescript
{
  results: Array<{
    id: string,
    title: string,
    status: 'public' | 'unlisted' | 'private' | 'deleted',
    thumbnail?: string,
    publishedAt?: string,
    contentType: 'video' | 'short',
    duration?: string,
    fromCache: boolean
  }>
}
```

## Database Schema

### `video_cache` Table

```sql
CREATE TABLE video_cache (
  video_id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Acknowledgments

- YouTube Data API v3 for video metadata
- Supabase for backend infrastructure
- shadcn/ui for beautiful UI components
