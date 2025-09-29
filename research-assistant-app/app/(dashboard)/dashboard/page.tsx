"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bot, Users, FileText, Zap, Search, BookOpen, MessageSquare, User, Mail, Calendar, Database, Server, Cpu, Brain } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import AuthGuard from "@/components/AuthGuard"
import { getResearchers } from "@/services/researcherService"
import { dataManagementService } from "@/services/dataManagementService"

interface DatabaseStats {
  totalResearchers: number
  totalDatabases: number
  cachedResearchers: number
}

export default function DashboardPage() {
  const { user } = useAuth()
    const [dbStats, setDbStats] = useState<DatabaseStats>({
    totalResearchers: 0,
    totalDatabases: 0,
    cachedResearchers: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch researchers count from backend v2 using service
        try {
          const researchers = await getResearchers()
          setDbStats(prev => ({
            ...prev,
            totalResearchers: researchers.length,
            cachedResearchers: researchers.length
          }))
        } catch (researcherError) {
          console.error('Failed to fetch researchers:', researcherError)
        }
        
        // Fetch database count from data management service
        try {
          const databases = await dataManagementService.getDatabases()
          setDbStats(prev => ({
            ...prev,
            totalDatabases: databases.length
          }))
        } catch (dbError) {
          console.error('Database service error, trying direct API:', dbError)
          // Fallback: try data management API directly
          try {
            const databasesResponse = await fetch('http://localhost:8080/api/databases/')
            if (databasesResponse.ok) {
              const databases = await databasesResponse.json()
              setDbStats(prev => ({
                ...prev,
                totalDatabases: databases.length
              }))
            }
          } catch (directError) {
            console.error('Direct API fetch error:', directError)
            // Final fallback: try MCP server directly
            try {
              const mcpResponse = await fetch('http://localhost:8017/mcp', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'tools/call',
                  params: {
                    name: 'list_dbs',
                    arguments: {}
                  }
                })
              })
              
              if (mcpResponse.ok) {
                const mcpData = await mcpResponse.json()
                const databases = mcpData.result?.content || []
                setDbStats(prev => ({
                  ...prev,
                  totalDatabases: databases.length
                }))
              }
            } catch (mcpError) {
              console.error('MCP server fetch error:', mcpError)
            }
          }
        }
      } catch (error) {
        console.error('Error fetching stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  const appServices = [
    {
      icon: MessageSquare,
      title: "Chat Assistant",
      description: "Used for ORCID searches of unsaved researchers and extracting information from ORCID API including similar projects, research fields, and collaboration networks",
      color: "bg-blue-500",
      features: ["ORCID API Integration", "Similar Projects Discovery", "Research Collaboration Mapping"]
    },
    {
      icon: Users,
      title: "Researchers Management",
      description: "Manage cached researchers from various connected databases. Filter, modify, add or delete researcher profiles. Remember to refresh RAG indexes after adding new experts to use them in similarity searches",
      color: "bg-green-500",
      features: ["Profile Management", "Multi-DB Integration", "RAG Index Refresh"]
    },
    {
      icon: Search,
      title: "Data Management",
      description: "Search for ORCID information using database tables (batch processing all rows) or single researcher search. Includes RAG-based similarity search on cached and indexed expert profiles",
      color: "bg-purple-500",
      features: ["Batch Table Processing", "Single ORCID Search", "RAG-Enhanced Matching"]
    },
    {
      icon: Database,
      title: "Admin Panel",
      description: "Configure API keys for various AI models, add database connections, and manage user accounts and permissions within the research platform",
      color: "bg-orange-500",
      features: ["API Key Management", "Database Connections", "User Administration"]
    },
  ]

  const appModels = [
    {
      icon: Brain,
      title: "AI Models",
      description: "Advanced machine learning models for research assistance",
      models: ["OpenAI  o4-mini", "Gemini-2.5-pro and flash", "DeepSeek V3.1"]
    },
    {
      icon: Server,
      title: "Backend Services",
      description: "Robust API services for data management",
      models: ["FastAPI", "SQLAlchemy", "PostgreSQL", "JWT Auth"]
    },
    {
      icon: Cpu,
      title: "Frontend Framework",
      description: "Modern React-based user interface",
      models: ["Next.js 14", "TypeScript", "Tailwind CSS", "Shadcn/ui"]
    },
  ]

  const stats = [
    {
      title: "Stored Researchers",
      value: loading ? "..." : dbStats.totalResearchers.toString(),
      change: loading ? "..." : `${dbStats.totalResearchers} total`,
      icon: Users,
      description: "Researchers in database"
    },
    {
      title: "Database Connections",
      value: loading ? "..." : dbStats.totalDatabases.toString(),
      change: loading ? "..." : `${dbStats.totalDatabases} active`,
      icon: Database,
      description: "Connected databases (YAML)"
    },
    // {
    //   title: "AI Interactions",
    //   value: "9,012",
    //   change: "+23%",
    //   icon: MessageSquare,
    //   description: "Total AI conversations"
    // },
    // {
    //   title: "Active Projects",
    //   value: "345",
    //   change: "+15%",
    //   icon: BookOpen,
    //   description: "Ongoing research projects"
    // },
  ]

  return (
    <AuthGuard>
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Research Assistant Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {user?.prenom} {user?.nom}! Explore features and manage your research workflow.
          </p>
        </div>

        {/* User Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="h-5 w-5 mr-2" />
              Your Profile
            </CardTitle>
            <CardDescription>Account information and status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center space-x-2">
                <Mail className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {user?.email}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Member since {user?.date_creation ? new Date(user.date_creation).toLocaleDateString() : 'N/A'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  user?.est_admin 
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                    : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                }`}>
                  {user?.est_admin ? 'Administrator' : 'User'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  user?.est_actif 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                }`}>
                  {user?.est_actif ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600">{stat.change}</span> from last month
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* App Services */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Application Services</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {appServices.map((service) => (
              <Card key={service.title} className="relative overflow-hidden">
                <CardHeader>
                  <div className="flex items-center space-x-4">
                    <div className={`p-2 rounded-lg ${service.color}`}>
                      <service.icon className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{service.title}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base mb-4">{service.description}</CardDescription>
                  <div className="flex flex-wrap gap-2">
                    {service.features.map((feature) => (
                      <Badge key={feature} variant="secondary" className="text-xs">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Application Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Brain className="h-5 w-5 text-blue-600" />
              <span>About Research Assistant Platform</span>
            </CardTitle>
            <CardDescription>Comprehensive AI-powered research management system</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Our Research Assistant Platform combines advanced AI capabilities with comprehensive database management 
              to streamline academic research workflows. The system integrates ORCID API services, RAG-enhanced 
              similarity matching, and multi-database connectivity to provide researchers with powerful tools for 
              discovery, collaboration, and knowledge management.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Key Technologies</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs">Next.js 14</Badge>
                  <Badge variant="outline" className="text-xs">FastAPI</Badge>
                  <Badge variant="outline" className="text-xs">PostgreSQL</Badge>
                  <Badge variant="outline" className="text-xs">ChromaDB</Badge>
                  <Badge variant="outline" className="text-xs">Ollama</Badge>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-sm">AI Models Supported</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs">OpenAI o4-mini</Badge>
                  <Badge variant="outline" className="text-xs">Gemini-2.5-flash and pro</Badge>
                  <Badge variant="outline" className="text-xs">DeepSeek V3.1</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>




      </div>
    </AuthGuard>
  )
}
