"use client"

import React from "react"

import { useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useRouter } from "next/navigation"
import AuthGuard from "@/components/AuthGuard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Send, Bot, User, Lightbulb, FileText, Search, BarChart, BookOpen, Zap, Settings, Users, Download, Trash2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { 
  sendChatMessage, 
  fetchAssistantResearchers, 
  clearChatHistory, 
  downloadResearchersReport,
  type Message as ServiceMessage,
  type AssistantResearcher,
  type ChatRequest 
} from "@/services/assistantService"

// Use types from service
type Message = ServiceMessage
type Researcher = AssistantResearcher

const presetPrompts = [
  {
    title: "Literature Review",
    prompt:
      "Help me conduct a comprehensive literature review on [topic]. Please provide a structured approach including search strategies, key databases, and analysis framework.",
    icon: BookOpen,
    category: "Research",
  },
  {
    title: "Data Analysis",
    prompt:
      "I need assistance with analyzing my research data. Can you guide me through statistical methods and interpretation techniques for [type of data]?",
    icon: BarChart,
    category: "Analysis",
  },
  {
    title: "Paper Summarization",
    prompt:
      "Please help me summarize this research paper, highlighting the main findings, methodology, and implications: [paste paper content or DOI]",
    icon: FileText,
    category: "Writing",
  },
  {
    title: "Research Proposal",
    prompt:
      "Assist me in developing a research proposal for [topic]. Include problem statement, objectives, methodology, and expected outcomes.",
    icon: Lightbulb,
    category: "Planning",
  },
  {
    title: "Citation Analysis",
    prompt:
      "Help me analyze citation patterns and identify key papers in [research field]. Suggest influential authors and trending topics.",
    icon: Search,
    category: "Research",
  },
  {
    title: "Methodology Design",
    prompt:
      "Guide me in designing an appropriate research methodology for studying [research question]. Include data collection and analysis methods.",
    icon: Zap,
    category: "Planning",
  },
]

const functionalities = [
  {
    title: "Smart Literature Search",
    description: "AI-powered search across academic databases with relevance ranking",
    icon: Search,
  },
  {
    title: "Paper Summarization",
    description: "Automatic extraction of key findings and methodologies from research papers",
    icon: FileText,
  },
  {
    title: "Data Analysis Assistant",
    description: "Statistical analysis guidance and interpretation support",
    icon: BarChart,
  },
  {
    title: "Research Planning",
    description: "Structured approach to research design and methodology selection",
    icon: Lightbulb,
  },
  {
    title: "Citation Management",
    description: "Intelligent citation analysis and reference management",
    icon: BookOpen,
  },
  {
    title: "Collaboration Tools",
    description: "Connect with researchers and facilitate collaborative projects",
    icon: User,
  },
]

const modelOptions = [
  { value: "o4-mini", label: "OpenAI 4o Mini", color: "bg-green-600", provider: "openai" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", color: "bg-blue-600", provider: "gemini" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", color: "bg-blue-700", provider: "gemini" },
  { value: "deepseek/deepseek-chat", label: "DeepSeek Chat", color: "bg-purple-600", provider: "deepseek" },
  { value: "deepseek/deepseek-reasoner", label: "DeepSeek Reasoner", color: "bg-purple-700", provider: "deepseek" },
]

const predefinedPrompts = [
  // { label: "List all databases", prompt: "List all connected databases." },
  // { label: "Show schema for DB", prompt: "Show schema for database X." },
  { label: "Search ORCID by keyword", prompt: "Search ORCID for researchers with keywords: AI, machine learning." },
  // { label: "Search ENSIAS researchers", prompt: "Search for researchers from ENSIAS (École Nationale Supérieure d'Informatique et d'Analyse des Systèmes)." },
  { label: "Get ORCID profile", prompt: "Get ORCID profile for ID: 0000-0001-2345-6789." },
  { label: "List works for ORCID ID", prompt: "List works for ORCID ID: 0000-0001-2345-6789." },
  { label: "Generate researcher report", prompt: "Generate a comprehensive report of all discovered researchers including their publications and affiliations." },
  { label: "Show researcher statistics", prompt: "Show me statistics about the researchers we've found: institutions, countries, research areas." },
  { label: "Find AI researchers", prompt: "Find researchers working on artificial intelligence and machine learning." },
  // { label: "List researchers by institution", prompt: "Group the discovered researchers by their institutions." },
]

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      content:
        "Hello! I'm your AI Research Assistant. I'm here to help you with literature reviews, data analysis, paper summarization, and much more. How can I assist you with your research today?",
      sender: "assistant",
      timestamp: new Date(),
    },
  ])
  const [inputMessage, setInputMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState("gpt-4o-mini")
  const [apiKeys, setApiKeys] = useState({
    deepseek: "",
    gpt: "",
    gemini: "",
  })
  const [showApiSettings, setShowApiSettings] = useState(false)
  const [researchers, setResearchers] = useState<Researcher[]>([])
  const [showResearchers, setShowResearchers] = useState(false)
  const [isLoadingResearchers, setIsLoadingResearchers] = useState(false)

  const sendMessage = async (content: string) => {
    if (!content.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      sender: "user",
      timestamp: new Date(),
    }

    setMessages((prev: Message[]) => [...prev, userMessage])
    setInputMessage("")
    setIsLoading(true)

    try {
      const chatRequest: ChatRequest = {
        message: content,
        model_name: selectedModel,
        history: messages.map((m: Message) => [m.sender, m.content] as [string, string]),
      }
      
      const data = await sendChatMessage(chatRequest)
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: data.response || "[No response from backend]",
        sender: "assistant",
        timestamp: new Date(),
      }
      setMessages((prev: Message[]) => [...prev, assistantMessage])
      
      // If new researchers were found, refresh the researchers list
      if (data.new_researchers_count && data.new_researchers_count > 0) {
        fetchResearchers()
      }
    } catch (err) {
      setMessages((prev: Message[]) => [...prev, {
        id: (Date.now() + 2).toString(),
        content: `Error: ${err}`,
        sender: "assistant",
        timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const fetchResearchers = async () => {
    setIsLoadingResearchers(true)
    try {
      const data = await fetchAssistantResearchers()
      setResearchers(data.researchers || [])
    } catch (err) {
      console.error("Failed to fetch researchers:", err)
    } finally {
      setIsLoadingResearchers(false)
    }
  }

  const generateReport = async () => {
    try {
      const result = await downloadResearchersReport()
      
      if (result.success && result.message) {
        setMessages((prev: Message[]) => [...prev, result.message!])
      }
    } catch (err) {
      console.error("Failed to generate report:", err)
    }
  }

  const clearHistory = async () => {
    if (confirm("Clear all conversation history? This action cannot be undone.")) {
      setMessages([{
        id: "1",
        content: "Hello! I'm your AI Research Assistant. Fresh start - how can I help you today?",
        sender: "assistant",
        timestamp: new Date(),
      }])
      
      try {
        await clearChatHistory()
      } catch (err) {
        console.error("Failed to clear server history:", err)
      }
    }
  }

  const handlePresetPrompt = (prompt: string) => {
    setInputMessage(prompt) // Fill the input area instead of sending directly
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(inputMessage)
  }

  return (
    <AuthGuard>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Research Assistant</h1>
          <p className="text-muted-foreground">Your intelligent companion for research tasks</p>
        </div>
        <div className="flex items-center space-x-2">
          <Dialog>
            <DialogTrigger asChild>
              {/* <Button variant="outline">
                <Users className="mr-2 h-4 w-4" />
                Researchers ({researchers.length})
              </Button> */}
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
              <DialogHeader>
                <DialogTitle>Discovered Researchers</DialogTitle>
                <DialogDescription>
                  Researchers found and stored during your conversations
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Button onClick={fetchResearchers} disabled={isLoadingResearchers} size="sm">
                    {isLoadingResearchers ? "Refreshing..." : "Refresh List"}
                  </Button>
                  <Button onClick={generateReport} size="sm" variant="secondary">
                    <Download className="mr-2 h-4 w-4" />
                    Generate Report
                  </Button>
                </div>
                <ScrollArea className="h-[400px] pr-4">
                  {researchers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
                      <p>No researchers discovered yet.</p>
                      <p className="text-sm mt-2">Search for researchers using ORCID to see them appear here!</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {researchers.map((researcher) => (
                        <Card key={researcher.id} className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <h4 className="font-semibold">{researcher.full_name}</h4>
                                {researcher.has_orcid && (
                                  <Badge variant="secondary" className="text-xs">
                                    ORCID
                                  </Badge>
                                )}
                                {researcher.confidence_score && (
                                  <Badge 
                                    variant={researcher.confidence_score === "high" ? "default" : 
                                            researcher.confidence_score === "medium" ? "secondary" : "outline"}
                                    className="text-xs"
                                  >
                                    {researcher.confidence_score}
                                  </Badge>
                                )}
                              </div>
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <p><strong>Affiliation:</strong> {researcher.affiliation}</p>
                                {researcher.country && <p><strong>Country:</strong> {researcher.country}</p>}
                                {researcher.orcid_id && (
                                  <p><strong>ORCID:</strong> 
                                    <a 
                                      href={`https://orcid.org/${researcher.orcid_id}`} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="ml-1 text-blue-600 hover:underline"
                                    >
                                      {researcher.orcid_id}
                                    </a>
                                  </p>
                                )}
                                {researcher.works_count > 0 && (
                                  <p><strong>Publications:</strong> {researcher.works_count} works</p>
                                )}
                                {researcher.main_research_areas && researcher.main_research_areas.length > 0 && (
                                  <div className="mt-2">
                                    <strong>Research Areas:</strong>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {researcher.main_research_areas.map((area, idx) => (
                                        <Badge key={idx} variant="outline" className="text-xs">
                                          {area}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                              {researcher.bio && (
                                <p className="mt-2 text-sm italic">{researcher.bio}</p>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog>
            <DialogTrigger asChild>
              {/* <Button variant="outline">
                <Zap className="mr-2 h-4 w-4" />
                View Features
              </Button> */}
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>AI Assistant Functionalities</DialogTitle>
                <DialogDescription>
                  Explore the powerful features available to enhance your research workflow
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {functionalities.map((func) => (
                  <div key={func.title} className="flex items-start space-x-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                      <func.icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h4 className="font-semibold">{func.title}</h4>
                      <p className="text-sm text-muted-foreground">{func.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="h-[600px]">
        {/* Chat Interface - Full width */}
          <Card className="h-full flex flex-col">
            <CardHeader className="flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center space-x-2">
                  <Bot className="h-5 w-5" />
                  <span>Research Assistant Chat</span>
                </CardTitle>
                <div className="flex items-center space-x-2">
                  <Select
                    value={selectedModel}
                    onValueChange={(value: string) => setSelectedModel(value as any)}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions.map((model: typeof modelOptions[0]) => (
                        <SelectItem key={model.value} value={model.value}>
                          <div className="flex items-center space-x-2">
                            <div className={`w-2 h-2 rounded-full ${model.color}`}></div>
                            <span>{model.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={clearHistory} title="Clear conversation history">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  {/* <Button variant="outline" size="sm" onClick={() => setShowApiSettings(!showApiSettings)}>
                    <Settings className="h-4 w-4" />
                  </Button> */}
                </div>
              </div>
              {showApiSettings && (
                <div className="mt-4 p-4 border rounded-lg bg-muted/50">
                  <h4 className="font-semibold mb-3">API Configuration</h4>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="openai-api" className="text-sm font-medium">
                        OpenAI API Key
                      </Label>
                      <Input
                        id="openai-api"
                        type="password"
                        placeholder="Enter your OpenAI API key"
                        value={apiKeys.gpt}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKeys((prev) => ({ ...prev, gpt: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="gemini-api" className="text-sm font-medium">
                        Gemini API Key
                      </Label>
                      <Input
                        id="gemini-api"
                        type="password"
                        placeholder="Enter your Gemini API key"
                        value={apiKeys.gemini}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKeys((prev) => ({ ...prev, gemini: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="deepseek-api" className="text-sm font-medium">
                        DeepSeek API Key
                      </Label>
                      <Input
                        id="deepseek-api"
                        type="password"
                        placeholder="Enter your DeepSeek API key"
                        value={apiKeys.deepseek}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKeys((prev) => ({ ...prev, deepseek: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0">
            {/* Chat Messages Area - Scrollable */}
            <div className="flex-1 overflow-y-auto pr-4 mb-4" style={{ maxHeight: '400px' }}>
                <div className="space-y-4 pb-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex items-start space-x-3 ${
                        message.sender === "user" ? "flex-row-reverse space-x-reverse" : ""
                      }`}
                    >
                      <div
                        className={`p-2 rounded-full flex-shrink-0 ${
                          message.sender === "user" ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-700"
                        }`}
                      >
                        {message.sender === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </div>
                      <div className={`flex-1 min-w-0 ${message.sender === "user" ? "text-right" : ""}`}>
                        <div
                          className={`inline-block p-3 rounded-lg max-w-[85%] break-words ${
                            message.sender === "user" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{message.timestamp.toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex items-start space-x-3">
                      <div className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="inline-block p-3 rounded-lg bg-gray-100 dark:bg-gray-800">
                        <div className="flex space-x-2">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                            <div
                              className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                              style={{ animationDelay: "0.1s" }}
                            ></div>
                            <div
                              className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                              style={{ animationDelay: "0.2s" }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
            </div>

            {/* Input Area with Quick Prompts Dropdown */}
            <div className="flex-shrink-0 border-t pt-4 space-y-3">
              {/* Quick Prompts Dropdown */}
              <div className="flex items-center space-x-2">
                <Label className="text-sm font-medium">Quick Prompts:</Label>
                <Select onValueChange={handlePresetPrompt}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Choose a quick prompt..." />
                  </SelectTrigger>
                  <SelectContent>
                    {predefinedPrompts.map((preset) => (
                      <SelectItem key={preset.label} value={preset.prompt}>
                        <div className="flex items-start space-x-2">
                          <Lightbulb className="h-4 w-4 mt-0.5 text-blue-600 flex-shrink-0" />
                          <div>
                            <div className="font-medium text-sm">{preset.label}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {preset.prompt}
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Chat Input */}
                <form onSubmit={handleSubmit} className="flex space-x-2">
                  <Input
                    value={inputMessage}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputMessage(e.target.value)}
                    placeholder="Ask me anything about your research..."
                    disabled={isLoading}
                    className="flex-1"
                  />
                  <Button type="submit" disabled={isLoading || !inputMessage.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
      </div>
      </div>
    </AuthGuard>
  )
}
