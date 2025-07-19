import React, { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileText,
  Clipboard,
  Download,
  Filter,
  Search,
  RotateCcw,
  Video,
  Play,
  Shield,
  CheckCircle,
  Lock,
  Trash2,
  Eye,
  Info,
  Clock,
  Zap,
  Link,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface VideoData {
  url: string;
  id: string;
  title: string;
  status: "public" | "unlisted" | "private" | "deleted" | "checking";
  thumbnail?: string;
  publishedAt?: string;
  contentType?: "video" | "short";
  duration?: string;
  fromCache?: boolean;
}

const Index = () => {
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [channelInput, setChannelInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterContentType, setFilterContentType] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("status");
  const [sortDescending, setSortDescending] = useState(false);
  const [ignoreCache, setIgnoreCache] = useState(false);
  const { toast } = useToast();

  const extractVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
      /youtube\.com\/shorts\/([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const checkVideoStatus = async (
    videoIds?: string[],
    channelUrl?: string,
    ignoreCache?: boolean
  ): Promise<any[]> => {
    console.log("Calling Supabase function with:", {
      videoIds: videoIds?.length || 0,
      channelUrl,
      ignoreCache,
    });

    const { data, error } = await supabase.functions.invoke(
      "check-youtube-status",
      {
        body: { videoIds, channelUrl, ignoreCache },
      }
    );

    if (error) {
      console.error("Supabase function error:", error);
      throw new Error(error.message || "Failed to check video status");
    }

    if (data?.error) {
      console.error("YouTube API error:", data.error);
      throw new Error(data.error);
    }

    return data?.results || [];
  };

  const processUrls = useCallback(
    async (urls: string[]) => {
      setIsProcessing(true);
      const validUrls = urls.filter(
        (url) => url.trim() && extractVideoId(url.trim())
      );

      if (validUrls.length === 0) {
        toast({
          title: "No valid URLs found",
          description: "Please provide valid YouTube URLs",
          variant: "destructive",
        });
        setIsProcessing(false);
        return;
      }

      const videoIds = validUrls.map((url) => extractVideoId(url.trim())!);
      const initialVideos: VideoData[] = validUrls.map((url, index) => ({
        url: url.trim(),
        id: videoIds[index],
        title: "Checking...",
        status: "checking" as const,
      }));

      setVideos(initialVideos);

      try {
        console.log("Processing videos:", videoIds);
        const results = await checkVideoStatus(
          videoIds,
          undefined,
          ignoreCache
        );

        const processedVideos: VideoData[] = validUrls.map((url, index) => {
          const videoId = videoIds[index];
          const result = results.find((r) => r.id === videoId);

          if (result) {
            return {
              url: url.trim(),
              id: videoId,
              title: result.title,
              status: result.status,
              thumbnail: result.thumbnail,
              publishedAt: result.publishedAt,
              contentType: result.contentType,
              fromCache: result.fromCache,
            };
          } else {
            return {
              url: url.trim(),
              id: videoId,
              title: "Error checking video",
              status: "deleted" as const,
            };
          }
        });

        setVideos(processedVideos);

        toast({
          title: "Processing complete",
          description: `Checked ${validUrls.length} videos`,
        });
      } catch (error) {
        console.error("Error processing videos:", error);
        toast({
          title: "Error checking videos",
          description:
            error instanceof Error
              ? error.message
              : "Please check your YouTube API configuration",
          variant: "destructive",
        });

        setVideos((prev) =>
          prev.map((v) => ({
            ...v,
            status: "deleted" as const,
            title: "Error checking video",
          }))
        );
      }

      setIsProcessing(false);
    },
    [toast, ignoreCache]
  );

  const handleChannelSubmit = async () => {
    if (!channelInput.trim()) return;

    setIsProcessing(true);
    setVideos([]);

    try {
      console.log("Processing channel:", channelInput);
      toast({
        title: "Scanning channel",
        description: "This may take a moment...",
      });

      const results = await checkVideoStatus(
        undefined,
        channelInput.trim(),
        ignoreCache
      );

      const processedVideos: VideoData[] = results.map((result) => ({
        url: `https://www.youtube.com/watch?v=${result.id}`,
        id: result.id,
        title: result.title,
        status: result.status,
        thumbnail: result.thumbnail,
        publishedAt: result.publishedAt,
        contentType: result.contentType,
        fromCache: result.fromCache,
      }));

      setVideos(processedVideos);

      toast({
        title: "Channel scan complete",
        description: `Found ${results.length} videos`,
      });
    } catch (error) {
      console.error("Error processing channel:", error);
      toast({
        title: "Error scanning channel",
        description:
          error instanceof Error ? error.message : "Failed to scan channel",
        variant: "destructive",
      });
    }

    setIsProcessing(false);
  };

  const handleTextSubmit = async () => {
    if (!textInput.trim()) return;

    const urls = textInput.split("\n").filter((url) => url.trim());
    await processUrls(urls);
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const urls = text.split("\n").filter((url) => url.trim());
    await processUrls(urls);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const urls = text.split("\n").filter((url) => url.trim());
      await processUrls(urls);
    } catch (error) {
      toast({
        title: "Clipboard access denied",
        description: "Please paste the URLs manually",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "public":
        return "bg-green-500";
      case "unlisted":
        return "bg-yellow-500";
      case "private":
        return "bg-red-500";
      case "deleted":
        return "bg-gray-500";
      case "checking":
        return "bg-blue-500 animate-pulse";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "public":
        return <CheckCircle className="w-4 h-4" />;
      case "unlisted":
        return <Eye className="w-4 h-4" />;
      case "private":
        return <Lock className="w-4 h-4" />;
      case "deleted":
        return <Trash2 className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getThumbnailIcon = (status: string) => {
    switch (status) {
      case "public":
        return <CheckCircle className="w-12 h-12 text-green-600" />;
      case "unlisted":
        return <Eye className="w-12 h-12 text-yellow-600" />;
      case "private":
        return <Lock className="w-12 h-12 text-red-600" />;
      case "deleted":
        return <Trash2 className="w-12 h-12 text-gray-600" />;
      default:
        return <Video className="w-12 h-12 text-gray-400" />;
    }
  };

  const getStatusCount = (status: string) => {
    return videos.filter((v) => v.status === status).length;
  };

  const getContentTypeCount = (contentType: string) => {
    return videos.filter((v) => v.contentType === contentType).length;
  };

  const getStatusCombinationCount = (statuses: string[]) => {
    return videos.filter((v) => statuses.includes(v.status)).length;
  };

  const formatDuration = (duration: string): string => {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return duration;
    
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  };

  const filteredAndSortedVideos = videos
    .filter((video) => filterStatus === "all" || video.status === filterStatus)
    .filter(
      (video) =>
        filterContentType === "all" || video.contentType === filterContentType
    )
    .sort((a, b) => {
      let result = 0;
      switch (sortBy) {
        case "status":
          result = a.status.localeCompare(b.status);
          break;
        case "title":
          result = a.title.localeCompare(b.title);
          break;
        case "date":
          result = (a.publishedAt || "").localeCompare(b.publishedAt || "");
          break;
        case "contentType":
          result = (a.contentType || "").localeCompare(b.contentType || "");
          break;
        default:
          result = 0;
      }
      return sortDescending ? -result : result;
    });

  const exportData = (status: string, format: "txt" | "json") => {
    let filteredVideos;

    if (status.includes(",")) {
      const statuses = status.split(",");
      filteredVideos = videos.filter((v) => statuses.includes(v.status));
    } else {
      filteredVideos = videos.filter(
        (v) => status === "all" || v.status === status
      );
    }

    if (filterContentType !== "all") {
      filteredVideos = filteredVideos.filter(
        (v) => v.contentType === filterContentType
      );
    }

    if (format === "txt") {
      const content = filteredVideos.map((v) => v.url).join("\n");
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const statusLabel = status.includes(",")
        ? status.replace(",", "-and-")
        : status;
      a.download = `youtube-${statusLabel}-${filterContentType}-videos.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const content = JSON.stringify(filteredVideos, null, 2);
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const statusLabel = status.includes(",")
        ? status.replace(",", "-and-")
        : status;
      a.download = `youtube-${statusLabel}-${filterContentType}-videos.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const resetAll = () => {
    setVideos([]);
    setChannelInput("");
    setTextInput("");
    setFilterStatus("all");
    setFilterContentType("all");
    setSortBy("status");
    setSortDescending(false);
  };

  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Input Section */}
        <Card className="mb-8 shadow-lg border-0">
          <CardHeader className="bg-gray-900 text-white rounded-t-lg">
            <CardTitle className="text-xl font-semibold">
              Input Methods
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <Tabs defaultValue="text" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-gray-100 p-1 rounded-lg">
                <TabsTrigger
                  value="channel"
                  className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm"
                >
                  <Search className="w-4 h-4 mr-2" />
                  Channel Scanner
                </TabsTrigger>
                <TabsTrigger
                  value="file"
                  className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  File Upload
                </TabsTrigger>
                <TabsTrigger
                  value="text"
                  className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Text Input
                </TabsTrigger>
              </TabsList>

              <TabsContent value="channel" className="space-y-4 mt-6">
                <div className="flex gap-3">
                  <Input
                    placeholder="Enter channel name or URL (e.g., @channelname, ChannelName, or full URL)"
                    value={channelInput}
                    onChange={(e) => setChannelInput(e.target.value)}
                    className="border-gray-300 focus:border-red-500 focus:ring-red-500"
                    disabled={isProcessing}
                  />
                  <Button
                    onClick={handleChannelSubmit}
                    disabled={isProcessing}
                    className="bg-red-600 hover:bg-red-700 text-white px-6 whitespace-nowrap"
                  >
                    {isProcessing ? "Scanning..." : "Scan Channel"}
                  </Button>
                </div>
                <p className="text-sm text-gray-500">
                  Scans both regular videos and YouTube Shorts from the channel
                </p>
              </TabsContent>

              <TabsContent value="file" className="space-y-4 mt-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-medium text-blue-900 mb-1">
                        File Format Requirements
                      </h4>
                      <div className="text-sm text-blue-700 space-y-1">
                        <p>
                          • Supported formats: <strong>.txt</strong> and{" "}
                          <strong>.csv</strong>
                        </p>
                        <p>• Each YouTube URL should be on a separate line</p>
                        <p>
                          • Supported URL formats: youtube.com/watch?v=,
                          youtu.be/, youtube.com/shorts/
                        </p>
                        <p>• Empty lines will be ignored</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Input
                    type="file"
                    accept=".txt,.csv"
                    onChange={handleFileUpload}
                    className="border-gray-300 focus:border-red-500 focus:ring-red-500"
                    disabled={isProcessing}
                  />
                  <Button
                    onClick={handlePasteFromClipboard}
                    variant="outline"
                    disabled={isProcessing}
                    className="border-gray-300 hover:bg-gray-50 whitespace-nowrap"
                  >
                    <Clipboard className="w-4 h-4 mr-2" />
                    Paste from Clipboard
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="text" className="space-y-4 mt-6">
                <Textarea
                  placeholder="Paste YouTube URLs here (one per line)"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  className="min-h-32 border-gray-300 focus:border-red-500 focus:ring-red-500"
                />
                <Button
                  onClick={handleTextSubmit}
                  disabled={isProcessing}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {isProcessing ? "Processing..." : "Check URLs"}
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Results Section */}
        {videos.length > 0 && (
          <>
            {/* Stats and Controls */}
            <Card className="mb-6 shadow-lg border-0">
              <CardContent className="p-6">
                <div className="space-y-6">
                  {/* Status Stats */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Status Overview
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      <Badge className="bg-green-100 text-green-800 border-green-200 px-3 py-1 flex items-center gap-2 hover:bg-green-200 transition-colors">
                        <CheckCircle className="w-4 h-4" />
                        <span>Public: {getStatusCount("public")}</span>
                      </Badge>
                      <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 px-3 py-1 flex items-center gap-2 hover:bg-yellow-200 transition-colors">
                        <Eye className="w-4 h-4" />
                        <span>Unlisted: {getStatusCount("unlisted")}</span>
                      </Badge>
                      <Badge className="bg-red-100 text-red-800 border-red-200 px-3 py-1 flex items-center gap-2 hover:bg-red-200 transition-colors">
                        <Lock className="w-4 h-4" />
                        <span>Private: {getStatusCount("private")}</span>
                      </Badge>
                      <Badge className="bg-gray-100 text-gray-800 border-gray-200 px-3 py-1 flex items-center gap-2 hover:bg-gray-200 transition-colors">
                        <Trash2 className="w-4 h-4" />
                        <span>Deleted: {getStatusCount("deleted")}</span>
                      </Badge>
                    </div>
                  </div>

                  {/* Content Type Stats */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Content Type
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      <Badge className="bg-blue-100 text-blue-800 border-blue-200 px-3 py-1 flex items-center gap-2 hover:bg-blue-200 transition-colors">
                        <Video className="w-4 h-4" />
                        Videos: {getContentTypeCount("video")}
                      </Badge>
                      <Badge className="bg-purple-100 text-purple-800 border-purple-200 px-3 py-1 flex items-center gap-2 hover:bg-purple-200 transition-colors">
                        <Play className="w-4 h-4" />
                        Shorts: {getContentTypeCount("short")}
                      </Badge>
                    </div>
                  </div>

                  {/* Controls */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Filter & Export
                    </h3>
                    <div className="flex flex-wrap gap-4 items-center">
                      <Select
                        value={filterStatus}
                        onValueChange={setFilterStatus}
                      >
                        <SelectTrigger className="w-48 border-gray-300">
                          <Filter className="w-4 h-4 mr-2" />
                          <SelectValue placeholder="Filter by status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="public">Public</SelectItem>
                          <SelectItem value="unlisted">Unlisted</SelectItem>
                          <SelectItem value="private">Private</SelectItem>
                          <SelectItem value="deleted">Deleted</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select
                        value={filterContentType}
                        onValueChange={setFilterContentType}
                      >
                        <SelectTrigger className="w-48 border-gray-300">
                          <SelectValue placeholder="Filter by type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Content</SelectItem>
                          <SelectItem value="video">Videos Only</SelectItem>
                          <SelectItem value="short">Shorts Only</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="w-48 border-gray-300">
                          <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="status">Status</SelectItem>
                          <SelectItem value="title">Title</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                          <SelectItem value="contentType">
                            Content Type
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      <div className="flex items-center space-x-2">
                        <Switch
                          id="sort-descending"
                          checked={sortDescending}
                          onCheckedChange={setSortDescending}
                        />
                        <Label
                          htmlFor="sort-descending"
                          className="text-sm font-medium text-gray-700 whitespace-nowrap"
                        >
                          Reverse Sort
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          id="ignore-cache"
                          checked={ignoreCache}
                          onCheckedChange={setIgnoreCache}
                          disabled={isProcessing}
                        />
                        <Label
                          htmlFor="ignore-cache"
                          className="text-sm font-medium text-gray-700 whitespace-nowrap"
                        >
                          Force Refresh
                        </Label>
                      </div>

                      <div className="flex gap-2 ml-auto">
                        <Button
                          onClick={() => exportData("public", "txt")}
                          variant="outline"
                          size="sm"
                          className="border-green-300 hover:bg-green-50 text-green-700"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Public TXT ({getStatusCount("public")})
                        </Button>
                        <Button
                          onClick={() => exportData("unlisted", "txt")}
                          variant="outline"
                          size="sm"
                          className="border-yellow-300 hover:bg-yellow-50 text-yellow-700"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Unlisted TXT ({getStatusCount("unlisted")})
                        </Button>
                        <Button
                          onClick={() => exportData("public,unlisted", "txt")}
                          variant="outline"
                          size="sm"
                          className="border-blue-300 hover:bg-blue-50 text-blue-700"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Public+Unlisted TXT (
                          {getStatusCombinationCount(["public", "unlisted"])})
                        </Button>
                        <Button
                          onClick={() => exportData(filterStatus, "txt")}
                          variant="outline"
                          size="sm"
                          className="border-gray-300 hover:bg-gray-50"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Filtered TXT ({filteredAndSortedVideos.length})
                        </Button>
                        <Button
                          onClick={() => exportData(filterStatus, "json")}
                          variant="outline"
                          size="sm"
                          className="border-gray-300 hover:bg-gray-50"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Export filtered JSON ({filteredAndSortedVideos.length}
                          )
                        </Button>
                        <Button
                          onClick={resetAll}
                          variant="outline"
                          size="sm"
                          className="border-gray-300 hover:bg-gray-50"
                        >
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Reset
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Results Grid */}
            {filteredAndSortedVideos.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredAndSortedVideos.map((video) => (
                  <Card
                    key={video.id}
                    className="shadow-md border-0 hover:shadow-lg transition-shadow bg-white"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="relative w-20 h-14 rounded border border-gray-200 bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {video.thumbnail ? (
                            <img
                              src={video.thumbnail}
                              alt={video.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="flex items-center justify-center w-full h-full bg-gray-50 p-2">
                              {getThumbnailIcon(video.status)}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-gray-900 font-medium text-sm leading-tight mb-2 line-clamp-2">
                            {video.title}
                          </h3>
                          <a
                            href={video.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 text-xs mb-1 group"
                          >
                            <Link className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate group-hover:underline">
                              {video.url}
                            </span>
                          </a>
                          
                          {/* Additional Properties */}
                          <div className="space-y-0.5 mb-2">
                            {video.publishedAt && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                <Clock className="w-3 h-3" />
                                <span>
                                  {new Date(video.publishedAt).toLocaleDateString()}
                                </span>
                              </div>
                            )}
                            {video.duration && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                <Video className="w-3 h-3" />
                                <span>{formatDuration(video.duration)}</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex gap-2 flex-wrap">
                            <Badge
                              className={`${getStatusColor(
                                video.status
                              )} text-white text-xs px-2 py-1 flex items-center gap-1.5 hover:opacity-90 transition-opacity`}
                            >
                              {getStatusIcon(video.status)}
                              <span>
                                {video.status.charAt(0).toUpperCase() +
                                  video.status.slice(1)}
                              </span>
                            </Badge>
                            {video.contentType && (
                              <Badge
                                className={`${
                                  video.contentType === "short"
                                    ? "bg-purple-600 hover:bg-purple-700"
                                    : "bg-blue-600 hover:bg-blue-700"
                                } text-white text-xs flex items-center gap-1 transition-colors`}
                              >
                                {video.contentType === "short" ? (
                                  <Play className="w-3 h-3" />
                                ) : (
                                  <Video className="w-3 h-3" />
                                )}
                                {video.contentType === "short"
                                  ? "Short"
                                  : "Video"}
                              </Badge>
                            )}
                            {video.fromCache !== undefined && (
                              <Badge
                                variant="outline"
                                className={`text-xs flex items-center gap-1 ${
                                  video.fromCache
                                    ? "border-orange-300 text-orange-700 bg-orange-50"
                                    : "border-green-300 text-green-700 bg-green-50"
                                }`}
                              >
                                {video.fromCache ? (
                                  <Clock className="w-3 h-3" />
                                ) : (
                                  <Zap className="w-3 h-3" />
                                )}
                                {video.fromCache ? "Cached" : "Fresh"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="shadow-md border-0 bg-white">
                <CardContent className="p-8 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                      <Search className="w-8 h-8 text-gray-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        No videos found
                      </h3>
                      <p className="text-gray-600">
                        {videos.length === 0 
                          ? "No videos have been processed yet. Add some YouTube URLs to get started."
                          : "No videos match the current filters. Try adjusting your filter settings."
                        }
                      </p>
                    </div>
                    {videos.length > 0 && (
                      <Button
                        onClick={() => {
                          setFilterStatus("all");
                          setFilterContentType("all");
                        }}
                        variant="outline"
                        className="mt-2"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Clear Filters
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
