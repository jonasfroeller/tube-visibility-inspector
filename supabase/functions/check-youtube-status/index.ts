import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoIds, channelUrl, ignoreCache } = await req.json()
    const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY')
    
    if (!YOUTUBE_API_KEY) {
      console.error('YouTube API key not found')
      return new Response(
        JSON.stringify({ error: 'YouTube API key not configured' }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let finalVideoIds = videoIds || []
    let videoTypes: { [key: string]: 'video' | 'short' } = {}

    // If channel URL is provided, try API first, then scrape as fallback
    if (channelUrl) {
      console.log('Processing channel input:', channelUrl)
      let channelVideoIds: string[] = []
      let channelVideoTypes: { [key: string]: 'video' | 'short' } = {}

      try {
        console.log('Attempting to fetch videos using YouTube API...')
        const apiResult = await getChannelVideosWithApi(channelUrl, YOUTUBE_API_KEY)
        channelVideoIds = apiResult.videoIds
        channelVideoTypes = apiResult.types
        console.log(`Successfully fetched ${channelVideoIds.length} videos using API.`)
      } catch (apiError) {
        console.warn('YouTube API method failed, falling back to scraping.', apiError.message)
        try {
          const scrapeResult = await scrapeChannelContent(channelUrl)
          channelVideoIds = scrapeResult.videoIds
          channelVideoTypes = scrapeResult.types
          console.log(`Found ${channelVideoIds.length} videos from channel via scraping.`)
        } catch (scrapeError) {
          console.error('Channel scraping fallback also failed:', scrapeError)
          return new Response(
            JSON.stringify({ error: 'Failed to fetch channel videos using both API and scraping methods.' }), 
            { 
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }
      }
      
      finalVideoIds = [...new Set([...finalVideoIds, ...channelVideoIds])] // Use Set to avoid duplicates
      videoTypes = { ...videoTypes, ...channelVideoTypes }
    }

    const allVideoIds = [...finalVideoIds]; // Keep original order for sorting later

    if (allVideoIds.length === 0) {
      return new Response(
        JSON.stringify({ results: [] }), 
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    const cachedResults: any[] = []
    let idsToFetch = [...allVideoIds]
    
    if (!ignoreCache) {
      const cacheExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 24 hours ago
      
      console.log('Checking cache for videos...')
      const { data: cacheData, error: cacheError } = await supabaseAdmin
        .from('video_cache')
        .select('video_id, data')
        .in('video_id', allVideoIds)
        .gt('cached_at', cacheExpiry)

      if (cacheError) {
        console.error('Error fetching from cache:', cacheError)
      }

      if (cacheData && cacheData.length > 0) {
        const cachedIds = new Set()
        cacheData.forEach(item => {
          cachedResults.push({ ...item.data, fromCache: true })
          cachedIds.add(item.video_id)
        })
        idsToFetch = allVideoIds.filter(id => !cachedIds.has(id))
        console.log(`Found ${cachedResults.length} valid items in cache. Fetching ${idsToFetch.length} remaining items.`)
      } else {
        console.log('No valid cache entries found.')
      }
    } else {
      console.log('Cache ignored by user request.')
    }
    
    const freshResults: any[] = []
    
    if (idsToFetch.length > 0) {
      console.log(`Checking ${idsToFetch.length} videos from API`)
      
      // YouTube API allows up to 50 video IDs per request
      const batchSize = 50
      
      for (let i = 0; i < idsToFetch.length; i += batchSize) {
        const batch = idsToFetch.slice(i, i + batchSize)
        const videoIdsParam = batch.join(',')
        
        const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoIdsParam}&part=snippet,status,contentDetails&key=${YOUTUBE_API_KEY}`
        
        console.log(`Fetching batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(idsToFetch.length/batchSize)}`)
        
        const response = await fetch(url)
        const data = await response.json()
        
        if (!response.ok) {
          console.error('YouTube API error:', data)
          throw new Error(data.error?.message || 'YouTube API request failed')
        }
        
        const apiResults = new Map(data.items?.map((item: any) => [item.id, item]) || [])
        
        // Process all videos in the batch, falling back to scraping for missing ones
        const batchPromises = batch.map(async (videoId) => {
          const videoData = apiResults.get(videoId);
          
          if (videoData) {
            // Video found in API response
            const privacyStatus = videoData.status?.privacyStatus || 'unknown'
            const duration = videoData.contentDetails?.duration || ''
            
            const isShort = duration && parseDuration(duration) <= 61
            const contentType = videoTypes[videoId] || (isShort ? 'short' : 'video')
            
            return {
              id: videoId,
              title: videoData.snippet?.title || 'Unknown Title',
              status: privacyStatus,
              thumbnail: videoData.snippet?.thumbnails?.default?.url,
              publishedAt: videoData.snippet?.publishedAt,
              contentType: contentType,
              duration: duration,
              fromCache: false
            };
          } else {
            // Video not found via API - scrape to differentiate private/deleted
            const status = await checkMissingVideoStatusViaScraping(videoId);
            return {
              id: videoId,
              title: status === 'private' ? 'Private Video' : 'Video Not Found',
              status: status,
              thumbnail: null,
              publishedAt: null,
              contentType: videoTypes[videoId] || 'video',
              duration: null,
              fromCache: false
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        freshResults.push(...batchResults);
      }
      
      if (freshResults.length > 0 && !ignoreCache) {
        console.log('Updating cache with new results...')
        const cachePayload = freshResults
          .filter(r => ['public', 'unlisted', 'private', 'deleted'].includes(r.status)) // Cache all definitive statuses
          .map(result => {
            const { fromCache, ...dataToCache } = result;
            return {
              video_id: result.id,
              data: dataToCache,
              cached_at: new Date().toISOString()
            }
          })

        if(cachePayload.length > 0) {
            const { error: upsertError } = await supabaseAdmin
                .from('video_cache')
                .upsert(cachePayload, { onConflict: 'video_id' })

            if (upsertError) {
                console.error('Error updating cache:', upsertError)
            }
        }
      }
    }
    
    const allResults = [...cachedResults, ...freshResults]
    
    // Sort to maintain original order from the input
    const resultMap = new Map(allResults.map(r => [r.id, r]));
    const sortedResults = allVideoIds.map(id => resultMap.get(id)).filter(Boolean);
    
    console.log(`Successfully processed ${sortedResults.length} videos`)
    
    return new Response(
      JSON.stringify({ results: sortedResults }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
    
  } catch (error) {
    console.error('Error in check-youtube-status function:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }), 
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

// --- YouTube API-based Functions ---

async function getChannelVideosWithApi(channelInput: string, apiKey: string): Promise<{ videoIds: string[], types: { [key: string]: 'video' | 'short' } }> {
  // 1. Find channel ID from input
  const channelId = await findChannelId(channelInput, apiKey);
  if (!channelId) {
      throw new Error('Could not find channel ID for the given input via API.');
  }
  console.log(`Found channel ID: ${channelId}`);

  // 2. Get uploads playlist ID
  const uploadsPlaylistId = await getUploadsPlaylistId(channelId, apiKey);
  if (!uploadsPlaylistId) {
      throw new Error('Could not find uploads playlist for the channel.');
  }
  console.log(`Found uploads playlist ID: ${uploadsPlaylistId}`);

  // 3. Get all videos from the uploads playlist
  const videoIds = await getAllVideosFromPlaylist(uploadsPlaylistId, apiKey);
  console.log(`Found ${videoIds.length} videos in uploads playlist via API.`);

  // The API doesn't distinguish between shorts and videos in playlistItems.
  // This will be determined later by video duration.
  const types: { [key: string]: 'video' | 'short' } = {};

  return { videoIds, types };
}

async function findChannelId(channelInput: string, apiKey: string): Promise<string | null> {
  let query = channelInput;
  // Regex to find channel ID, custom URL, or handle from a full URL
  const urlMatch = channelInput.match(/youtube\.com\/(?:channel\/|c\/|@)?([a-zA-Z0-9_-]+)/);
  if (urlMatch && urlMatch[1]) {
      query = urlMatch[1];
  } else if (channelInput.startsWith('@')) {
      query = channelInput.substring(1);
  }

  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=channel&key=${apiKey}`;
  const response = await fetch(searchUrl);
  const data = await response.json();

  if (!response.ok || !data.items || data.items.length === 0) {
      console.error('Failed to find channel via search API', data.error?.message || 'No items returned');
      return null;
  }
  
  return data.items[0].snippet.channelId;
}

async function getUploadsPlaylistId(channelId: string, apiKey: string): Promise<string | null> {
  const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`;
  const response = await fetch(channelUrl);
  const data = await response.json();
  
  if (!response.ok || !data.items || data.items.length === 0) {
      console.error('Failed to get channel details', data.error?.message || 'No items returned');
      return null;
  }
  
  return data.items[0].contentDetails.relatedPlaylists.uploads;
}

async function getAllVideosFromPlaylist(playlistId: string, apiKey:string): Promise<string[]> {
  let videoIds: string[] = [];
  let nextPageToken: string | null = null;
  let pageCount = 0;
  
  do {
    pageCount++;
    let playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${apiKey}`;
    if (nextPageToken) {
        playlistUrl += `&pageToken=${nextPageToken}`;
    }
    
    console.log(`Fetching page ${pageCount} of playlist items...`);
    const response = await fetch(playlistUrl);
    const data = await response.json();
    
    if (!response.ok) {
        console.error('Failed to fetch playlist items', data.error?.message || 'Unknown error');
        break; // Stop on error
    }
    
    const ids = data.items.map((item: any) => item.snippet?.resourceId?.videoId).filter(Boolean);
    videoIds = [...videoIds, ...ids];
    
    nextPageToken = data.nextPageToken || null;
    
  } while (nextPageToken);
  
  return videoIds;
}


// --- Scraping-based Functions (Fallback) ---

async function scrapeChannelContent(channelInput: string): Promise<{ videoIds: string[], types: { [key: string]: 'video' | 'short' } }> {
  console.log('Starting comprehensive channel scraping for:', channelInput)
  
  const allVideoIds = new Set<string>()
  const videoTypes: { [key: string]: 'video' | 'short' } = {}
  
  // Normalize the channel input to proper URLs
  const { videosUrl, shortsUrl } = normalizeChannelUrls(channelInput)
  
  try {
    // Scrape regular videos with aggressive pagination
    console.log('Fetching videos from:', videosUrl)
    const videoResults = await scrapeWithAggressivePagination(videosUrl, 'video')
    videoResults.videoIds.forEach(id => {
      allVideoIds.add(id)
      videoTypes[id] = 'video'
    })
    console.log(`Found ${videoResults.videoIds.length} regular videos`)
    
    // Scrape shorts with aggressive pagination
    console.log('Fetching shorts from:', shortsUrl)
    const shortsResults = await scrapeWithAggressivePagination(shortsUrl, 'short')
    shortsResults.videoIds.forEach(id => {
      allVideoIds.add(id)
      videoTypes[id] = 'short'
    })
    console.log(`Found ${shortsResults.videoIds.length} shorts`)
    
    // Try additional channel discovery methods
    const additionalResults = await tryAdditionalChannelMethods(channelInput)
    additionalResults.forEach(id => allVideoIds.add(id))
    
    const totalUniqueVideos = Array.from(allVideoIds)
    console.log(`Total unique videos found: ${totalUniqueVideos.length}`)
    
    return {
      videoIds: totalUniqueVideos,
      types: videoTypes
    }
  } catch (error) {
    console.error('Comprehensive scraping error:', error)
    throw new Error(`Failed to scrape channel comprehensively: ${error.message}`)
  }
}

function normalizeChannelUrls(channelInput: string): { videosUrl: string, shortsUrl: string } {
  let baseUrl = ''
  
  // Check if it's already a full URL
  if (channelInput.startsWith('http://') || channelInput.startsWith('https://')) {
    // Extract base URL by removing /videos or /shorts suffix
    baseUrl = channelInput.replace(/\/(videos|shorts).*$/, '')
  } else {
    // It's just a channel name/handle, construct the URL
    let channelName = channelInput.trim()
    
    // Remove @ if present
    if (channelName.startsWith('@')) {
      channelName = channelName.substring(1)
    }
    
    // Try the @username format first (newer format)
    baseUrl = `https://www.youtube.com/@${channelName}`
  }
  
  return {
    videosUrl: `${baseUrl}/videos`,
    shortsUrl: `${baseUrl}/shorts`
  }
}

async function scrapeWithAggressivePagination(url: string, contentType: 'video' | 'short'): Promise<{ videoIds: string[] }> {
  const allVideoIds = new Set<string>()
  let continuationToken = null
  let pageCount = 0
  const maxPages = 50
  
  try {
    console.log(`Starting aggressive pagination for ${contentType}s from: ${url}`)
    
    // Get initial page and extract videos
    const initialResults = await scrapePageContent(url, contentType)
    initialResults.videoIds.forEach(id => allVideoIds.add(id))
    console.log(`Initial page: Found ${initialResults.videoIds.length} ${contentType}s`)
    
    // Extract continuation token from initial page
    const initialHtml = await fetchPageHtml(url)
    continuationToken = extractContinuationToken(initialHtml)
    
    // Continue with pagination using multiple strategies
    while (continuationToken && pageCount < maxPages) {
      pageCount++
      console.log(`Fetching page ${pageCount + 1} for ${contentType}s`)
      
      try {
        const pageResults = await fetchPageWithMultipleStrategies(url, continuationToken, contentType)
        
        let newVideosFound = 0
        pageResults.videoIds.forEach(id => {
          if (!allVideoIds.has(id)) {
            allVideoIds.add(id)
            newVideosFound++
          }
        })
        
        console.log(`Page ${pageCount + 1}: Found ${newVideosFound} new ${contentType}s (total: ${allVideoIds.size})`)
        
        if (newVideosFound === 0) {
          console.log(`No new videos found on page ${pageCount + 1}, trying alternative strategies`)
          
          // Try alternative continuation methods
          const altResults = await tryAlternativeContinuation(url, continuationToken, contentType)
          let altNewVideos = 0
          altResults.forEach(id => {
            if (!allVideoIds.has(id)) {
              allVideoIds.add(id)
              altNewVideos++
            }
          })
          
          if (altNewVideos === 0) {
            console.log('No videos found with alternative methods, stopping pagination')
            break
          } else {
            console.log(`Alternative methods found ${altNewVideos} additional videos`)
          }
        }
        
        continuationToken = pageResults.nextToken
        
        await new Promise(resolve => setTimeout(resolve, 500))
        
      } catch (error) {
        console.log(`Error on page ${pageCount + 1}: ${error.message}`)
        
        // Try to continue with a fresh token from the base page
        if (pageCount < 3) {
          console.log('Attempting to refresh continuation token')
          const refreshedHtml = await fetchPageHtml(`${url}?flow=grid&view=0`)
          continuationToken = extractContinuationToken(refreshedHtml)
          if (!continuationToken) break
        } else {
          break
        }
      }
    }
    
    console.log(`Completed aggressive pagination: ${allVideoIds.size} total ${contentType}s found across ${pageCount + 1} pages`)
    return { videoIds: Array.from(allVideoIds) }
    
  } catch (error) {
    console.error(`Error in aggressive pagination for ${contentType}:`, error)
    return { videoIds: Array.from(allVideoIds) }
  }
}

async function fetchPageHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'DNT': '1',
      'Connection': 'keep-alive'
    }
  })
  
  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.status}`)
  }
  
  return await response.text()
}

function extractContinuationToken(html: string): string | null {
  const tokenPatterns = [
    /"continuationCommand":{"token":"([^"]+)"/g,
    /"continuation":"([^"]+)"/g,
    /continuation=([^&"']+)/g,
    /"token":"([^"]+)"/g,
    /"continuationEndpoint":{"continuationCommand":{"token":"([^"]+)"/g,
    /var ytInitialData = [^;]*"continuation":"([^"]+)"/g,
    /"nextContinuationData":{"continuation":"([^"]+)"/g
  ]
  
  const tokens = new Set<string>()
  
  for (const pattern of tokenPatterns) {
    let match
    while ((match = pattern.exec(html)) !== null) {
      if (match[1] && match[1].length > 10 && !match[1].includes(' ')) {
        tokens.add(match[1])
      }
    }
  }
  
  // Return the longest token (usually more specific)
  const tokenArray = Array.from(tokens)
  if (tokenArray.length > 0) {
    return tokenArray.reduce((longest, current) => 
      current.length > longest.length ? current : longest
    )
  }
  
  return null
}

async function fetchPageWithMultipleStrategies(baseUrl: string, token: string, contentType: 'video' | 'short'): Promise<{ videoIds: string[], nextToken: string | null }> {
  const continuationUrls = [
    `${baseUrl}?pbj=1&continuation=${token}`,
    `${baseUrl}?flow=grid&view=0&pbj=1&continuation=${token}`,
    `${baseUrl}?continuation=${token}&pbj=1`,
    `https://www.youtube.com/youtubei/v1/browse?continuation=${token}`,
    `${baseUrl}?flow=list&view=0&continuation=${token}`,
  ]
  
  for (const url of continuationUrls) {
    try {
      console.log(`Trying continuation URL strategy: ${url.substring(0, 100)}...`)
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/html, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': baseUrl,
        }
      })
      
      if (response.ok) {
        const data = await response.text()
        const videoIds = extractVideoIds(data)
        const nextToken = extractContinuationToken(data)
        
        if (videoIds.length > 0) {
          console.log(`Strategy successful: found ${videoIds.length} videos`)
          return { videoIds, nextToken }
        }
      }
    } catch (error) {
      console.log(`Strategy failed: ${url}`)
      continue
    }
  }
  
  return { videoIds: [], nextToken: null }
}

async function tryAlternativeContinuation(baseUrl: string, token: string, contentType: 'video' | 'short'): Promise<string[]> {
  const alternativeIds = new Set<string>()
  
  // Try POST requests with continuation data
  const postData = {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: "2.0"
      }
    },
    continuation: token
  }
  
  try {
    const response = await fetch('https://www.youtube.com/youtubei/v1/browse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify(postData)
    })
    
    if (response.ok) {
      const data = await response.text()
      const videoIds = extractVideoIds(data)
      videoIds.forEach(id => alternativeIds.add(id))
      console.log(`POST continuation found ${videoIds.length} additional videos`)
    }
  } catch (error) {
    console.log('POST continuation failed:', error.message)
  }
  
  return Array.from(alternativeIds)
}

async function tryAdditionalChannelMethods(channelInput: string): Promise<string[]> {
  const additionalIds = new Set<string>()
  
  const channelVariations = [
    channelInput.replace('@', '/c/'),
    channelInput.replace('@', '/user/'),
    channelInput.replace('@', '/channel/'),
    `${channelInput}/featured`,
    `${channelInput}/playlists`,
  ]
  
  for (const variation of channelVariations) {
    try {
      const results = await scrapePageContent(variation, 'video')
      results.videoIds.forEach(id => additionalIds.add(id))
      
      await new Promise(resolve => setTimeout(resolve, 300))
    } catch (error) {
      continue
    }
  }
  
  console.log(`Additional channel methods found ${additionalIds.size} extra videos`)
  return Array.from(additionalIds)
}

async function scrapePageContent(url: string, contentType: 'video' | 'short'): Promise<{ videoIds: string[] }> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })
    
    if (!response.ok) {
      // If @username format fails, try /c/ format
      if (url.includes('/@')) {
        const fallbackUrl = url.replace('/@', '/c/')
        console.log(`Trying fallback URL for ${contentType}:`, fallbackUrl)
        
        const fallbackResponse = await fetch(fallbackUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        })
        
        if (!fallbackResponse.ok) {
          console.log(`Failed to fetch ${contentType} from both URLs`)
          return { videoIds: [] }
        }
        
        const html = await fallbackResponse.text()
        return { videoIds: extractVideoIds(html) }
      } else {
        console.log(`Failed to fetch ${contentType} from:`, url)
        return { videoIds: [] }
      }
    }
    
    const html = await response.text()
    return { videoIds: extractVideoIds(html) }
    
  } catch (error) {
    console.error(`Error scraping ${contentType}:`, error)
    return { videoIds: [] }
  }
}

function extractVideoIds(html: string): string[] {
  console.log('Processing HTML response, length:', html.length)
  
  const videoIds = new Set<string>()
  
  // Pattern 1: Standard video URLs in href attributes
  const hrefPattern = /href="\/watch\?v=([a-zA-Z0-9_-]{11})"/g
  let match
  while ((match = hrefPattern.exec(html)) !== null) {
    videoIds.add(match[1])
  }
  
  // Pattern 2: Video IDs in JavaScript data structures
  const jsPatterns = [
    /"videoId":"([a-zA-Z0-9_-]{11})"/g,
    /"id":"([a-zA-Z0-9_-]{11})"/g,
    /"videoDetails":{"videoId":"([a-zA-Z0-9_-]{11})"/g,
  ]
  
  for (const pattern of jsPatterns) {
    while ((match = pattern.exec(html)) !== null) {
      videoIds.add(match[1])
    }
  }
  
  // Pattern 3: Video IDs in watch URLs
  const watchPattern = /watch\?v=([a-zA-Z0-9_-]{11})/g
  while ((match = watchPattern.exec(html)) !== null) {
    videoIds.add(match[1])
  }
  
  // Pattern 4: Video IDs in embed URLs
  const embedPattern = /embed\/([a-zA-Z0-9_-]{11})/g
  while ((match = embedPattern.exec(html)) !== null) {
    videoIds.add(match[1])
  }
  
  // Pattern 5: Shorts URLs
  const shortsPattern = /shorts\/([a-zA-Z0-9_-]{11})/g
  while ((match = shortsPattern.exec(html)) !== null) {
    videoIds.add(match[1])
  }
  
  // Pattern 6: Enhanced JSON-like structures
  const jsonPatterns = [
    /"webCommandMetadata":{"url":"\/watch\?v=([a-zA-Z0-9_-]{11})"/g,
    /"navigationEndpoint":{"commandMetadata":{"webCommandMetadata":{"url":"\/watch\?v=([a-zA-Z0-9_-]{11})"/g,
    /"watchEndpoint":{"videoId":"([a-zA-Z0-9_-]{11})"/g,
    /"videoRenderer":{"videoId":"([a-zA-Z0-9_-]{11})"/g,
    /"compactVideoRenderer":{"videoId":"([a-zA-Z0-9_-]{11})"/g,
    /"gridVideoRenderer":{"videoId":"([a-zA-Z0-9_-]{11})"/g,
  ]
  
  for (const pattern of jsonPatterns) {
    while ((match = pattern.exec(html)) !== null) {
      videoIds.add(match[1])
    }
  }
  
  // Pattern 7: Generic 11-character patterns in video contexts
  const contextPattern = /"([a-zA-Z0-9_-]{11})"/g
  while ((match = contextPattern.exec(html)) !== null) {
    const potentialId = match[1]
    if (potentialId.length === 11 && /^[a-zA-Z0-9_-]+$/.test(potentialId)) {
      // Check if it appears in video-related context
      const contextStart = Math.max(0, match.index - 300)
      const contextEnd = Math.min(html.length, match.index + 300)
      const context = html.substring(contextStart, contextEnd)
      
      const videoKeywords = ['videoId', 'watch?v=', 'shorts/', 'embed/', 'thumbnail', 'title', 'videoRenderer', 'watchEndpoint']
      if (videoKeywords.some(keyword => context.includes(keyword))) {
        videoIds.add(potentialId)
      }
    }
  }
  
  const uniqueVideoIds = Array.from(videoIds)
  console.log(`Extracted ${uniqueVideoIds.length} unique video IDs`)
  
  return uniqueVideoIds
}

function parseDuration(duration: string): number {
  // Parse ISO 8601 duration format (PT1M30S = 1 minute 30 seconds)
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  
  const hours = parseInt(match[1] || '0', 10)
  const minutes = parseInt(match[2] || '0', 10)
  const seconds = parseInt(match[3] || '0', 10)
  
  return hours * 3600 + minutes * 60 + seconds
}

async function checkMissingVideoStatusViaScraping(videoId: string): Promise<'private' | 'deleted'> {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });
    
    const html = await response.text();
    
    // Check for private video messages
    if (html.toLocaleLowerCase().includes('private')) {
      return 'private';
    }
    
    // Check for deleted/terminated
    const deletedKeywords = [
      "isn't available",
      "unavailable",
      "deleted",
      "terminated",
      "no longer available"
    ];

    if (deletedKeywords.some(keyword => html.toLowerCase().includes(keyword))) {
      return 'deleted';
    }

    // Default to deleted if no specific message is found, which is a safe fallback
    return 'deleted';
  } catch (error) {
    console.error(`Scraping check failed for ${videoId}:`, error.message);
    // If any fetch/scrape error occurs, assume it's deleted
    return 'deleted';
  }
}
