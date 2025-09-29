"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useRouter } from "next/navigation"
import AuthGuard from "@/components/AuthGuard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"
import { 
  Database, 
  Search, 
  Users, 
  FileText, 
  Plus, 
  RefreshCw, 
  Settings, 
  Trash2, 
  Loader2, 
  Eye, 
  CheckCircle,
  Key,
  User,
  AlertTriangle,
  Filter,
  Download,
  Upload,
  SortAsc,
  XCircle,
  Building2,
  BookOpen,
  Tag,
  ChevronDown,
  ExternalLink,
  Mail,
  CheckSquare,
  Save,
  Microscope
} from "lucide-react"

// Import the API service
import dataManagementService from "@/services/dataManagementService"
// Import the database service
import { similarityService, type ResearcherMatch, type DetailedResearcherMatch } from "@/services/similarityService"
// Import the researcher service
import { checkResearcherByOrcid, saveResearchersBulk, overwriteResearchers, getResearchers } from "@/services/researcherService"
// Import the API key service
import apiKeyService, { type ApiKeys, type ApiKeyUpdate } from "@/services/apiKeyService"
import { 
  getDatabases, 
  createDatabase, 
  testDatabaseConnection, 
  deleteDatabase, 
  getDatabaseSchema,
  type DatabaseConfig, 
  type DatabaseConfigCreate 
} from "@/services/databaseService"

// Types from the services
interface LLMConfig {
  model_name: string
  api_key: string
  provider?: string
}

interface TaskStatus {
  task_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  created_at: string
  completed_at?: string
  result?: any
  error?: string
}

interface DatabaseConnection {
  id: string
  name: string
  type: "postgres" | "mysql"
  host: string
  port: number
  username: string
  password: string
  database: string
  status: "connected" | "disconnected" | "testing"
  created_at?: string
  last_tested?: string
}

interface TableColumn {
  name: string
  type: string
  selected: boolean
}

interface ResearcherRow {
  id: string
  nom: string
  prenom: string
  affiliation: string
  email?: string
  orcid?: string
  orcidStatus: "pending" | "found" | "not_found" | "verified"
  selected: boolean
  notes?: string
  originalData?: Record<string, any> // Store original table data for CSV export
  matchDetails?: {
    confidence: "high" | "medium" | "low"
    matchReasons: string[]
    doubtReasons: string[]
    profileData?: any
  }
  // New fields for research analysis
  mainResearchFields?: string[]
  researchKeywords?: string[]
  extractionStatus?: "pending" | "completed" | "failed"
  // New fields from table-search_v2 endpoint
  first_name?: string
  last_name?: string
  country?: string
  main_research_area?: string
  specific_research_area?: string
  reasoning?: string
  confidence?: number
  // UI state for expandable research areas
  showFullMainResearch?: boolean
  showFullSpecificResearch?: boolean
}

interface ORCIDProfile {
  orcid_id: string
  profile: any
}



interface ProjectResearcher {
  id: string
  name: string
  affiliation: string
  researchAreas: string[]
  keywords: string[]
  relevanceScore: number
  works: any[]
  topPublications?: { title: string; year: number }[]
  citationCount?: number
  hIndex?: number
  lastActivity?: string
  orcid?: string
  email?: string
  // New fields for similarity matching
  similarity_score?: number
  matched_content?: string
  domain_similarity?: number
  keywords_similarity?: number
  best_match_type?: 'domains' | 'keywords'
  domaines_recherche?: string
  mots_cles_specifiques?: string
}

interface ORCIDStructuredData {
  affiliations?: string[]
  research_fields?: string[]
  keywords?: string[]
  work_titles?: string[]
  total_works?: number
  external_identifiers?: Array<{
    type: string
    value: string
    url?: string
    source?: string
  }>
  researcher_urls?: Array<{
    name: string
    url: string
  }>
  scopus_id?: string
  scopus_url?: string
  linkedin_url?: string
  personal_website?: string
  google_scholar?: string
  researchgate?: string
  researcherid?: string
  researcherid_url?: string
  web_of_science?: string
  publons_url?: string
  academic_websites?: Array<{
    name: string
    url: string
  }>
  emails?: Array<{
    email: string
    verified: boolean
    primary: boolean
  }>
}

const databaseTypes = [
  { value: "postgres", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
]

const aiModels = [
  { value: "o4-mini", label: "OpenAI o4-mini", provider: "openai" },
  { value: "gemini/gemini-2.5-flash", label: "Google Gemini 2.5 Flash", provider: "gemini" },
  { value: "gemini/gemini-2.5-flash-lite", label: "Google Gemini 2.5 Flash Lite", provider: "gemini" },
  { value: "deepseek/deepseek-reasoner", label: "DeepSeek V3", provider: "deepseek" },
]






interface OrcidSearchProps {
  databases: DatabaseConnection[]
  selectedDatabase: string
  setSelectedDatabase: (value: string) => Promise<void>
  tables: string[]
  selectedTable: string
  setSelectedTable: (value: string) => void
  columns: TableColumn[]
  setColumns: (value: TableColumn[] | ((prev: TableColumn[]) => TableColumn[])) => void
  handleLoadSchema: (id: string) => void
  handleORCIDSearch: () => void
  isLoading: boolean
  progress: number
  progressDetails: {
    current: number
    total: number
    status: string
    current_researcher?: string
    substatus?: string
  } | null
  researcherRows: ResearcherRow[]
  setResearcherRows: (value: ResearcherRow[] | ((prev: ResearcherRow[]) => ResearcherRow[])) => void
  // Add ORCID Profile Modal props
  setOrcidProfileModalOpen: (open: boolean) => void
  setSelectedOrcidId: (id: string) => void
  setSelectedResearcherName: (name: string) => void
  // Add props needed for search again functionality
  selectedModel: string
  setSelectedModel: (model: string) => void
  apiKeys: { openai: string; gemini: string; deepseek: string }
  // Add CSV export functionality
  exportToCSV: () => void
  // Add persistent results props
  showSavedResults: () => void
  persistedResearcherRows: ResearcherRow[]
  persistedTableName: string
  // Add save functionality
  saveSelectedResearchers: () => void
  // Add filter functionality
  filterText: string
  setFilterText: (value: string) => void
  // Add research fields extraction
  extractResearchFieldsForAll: () => void
  // Add expansion state props
  expandedFields: Record<string, boolean>
  setExpandedFields: (value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void
  expandedKeywords: Record<string, boolean>
  setExpandedKeywords: (value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void
}

// Helper function to decode Unicode escape sequences
const decodeUnicode = (text: string): string => {
  if (!text) return text
  try {
    // Handle Unicode escape sequences like \u0000e9 -> é
    return text.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16))
    })
  } catch (error) {
    console.warn('Failed to decode Unicode:', error)
    return text
  }
}

// Helper function to filter researchers
const filterResearchers = (
  researcherRows: ResearcherRow[], 
  filterText: string, 
  columns: TableColumn[]
): ResearcherRow[] => {
  if (!filterText.trim()) return researcherRows
  
  const searchText = filterText.toLowerCase()
  
  return researcherRows.filter(researcher => {
    const searchableFields = [
      researcher.nom,
      researcher.prenom,
      decodeUnicode(researcher.affiliation),
      researcher.email || '',
      researcher.orcid || '',
      researcher.orcidStatus,
      decodeUnicode(researcher.notes || ''),
      researcher.matchDetails?.confidence || '',
      ...(researcher.matchDetails?.matchReasons || []),
      ...(researcher.matchDetails?.doubtReasons || []),
      ...(researcher.mainResearchFields || []),
      ...(researcher.researchKeywords || [])
    ]
    
    // Also search in original data from selected columns
    if (researcher.originalData) {
      columns.filter(c => c.selected).forEach(column => {
        const value = researcher.originalData?.[column.name]
        if (value) {
          searchableFields.push(String(value))
        }
      })
    }
    
    // Check if any field contains the search text
    return searchableFields.some(field => 
      String(field || '').toLowerCase().includes(searchText)
    )
  })
}

const OrcidSearch = ({
  databases,
  selectedDatabase,
  setSelectedDatabase,
  tables,
  selectedTable,
  setSelectedTable,
  columns,
  setColumns,
  handleLoadSchema,
  handleORCIDSearch,
  isLoading,
  progress,
  progressDetails,
  researcherRows,
  setResearcherRows,
  setOrcidProfileModalOpen,
  setSelectedOrcidId,
  setSelectedResearcherName,
  selectedModel,
  setSelectedModel,
  apiKeys,
  exportToCSV,
  showSavedResults,
  persistedResearcherRows,
  persistedTableName,
  saveSelectedResearchers,
  filterText,
  setFilterText,
  extractResearchFieldsForAll,
  expandedFields,
  setExpandedFields,
  expandedKeywords,
  setExpandedKeywords
}: OrcidSearchProps) => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Search className="h-5 w-5" />
          <span>ORCID Search & Verification</span>
        </CardTitle>
        <CardDescription>Select database, table, and columns to search for ORCID IDs</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="select-database">Select Database</Label>
            <Select value={selectedDatabase} onValueChange={setSelectedDatabase}>
              <SelectTrigger>
                <SelectValue placeholder="Choose database" />
              </SelectTrigger>
              <SelectContent>
                {databases.map((db) => (
                  <SelectItem key={db.id} value={db.id}>
                    {db.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="select-table">Select Table</Label>
            <Select value={selectedTable} onValueChange={setSelectedTable}>
              <SelectTrigger>
                <SelectValue placeholder="Choose table" />
              </SelectTrigger>
              <SelectContent>
                {tables.map((table) => (
                  <SelectItem key={table} value={table}>
                    {table}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Button 
              variant="outline"
              className="mt-6" 
              onClick={() => selectedDatabase && handleLoadSchema(selectedDatabase)}
              disabled={!selectedDatabase || isLoading}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Schema
            </Button>
          </div>
        </div>

        {/* AI Model Selection */}
        <div>
          <Label htmlFor="model-select">Select AI Model</Label>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger>
              <SelectValue placeholder="Choose AI model" />
            </SelectTrigger>
            <SelectContent>
              {aiModels.map((model) => (
                <SelectItem key={model.value} value={model.value}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Choose the AI model for ORCID search and analysis
          </p>
        </div>

        {columns.length > 0 && (
          <div>
            <Label>Select Columns for ORCID Search</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
              {columns.map((column) => (
                <div key={column.name} className="flex items-center space-x-2">
                  <Checkbox
                    id={column.name}
                    checked={column.selected}
                    onCheckedChange={(checked) =>
                      setColumns((prev) =>
                        prev.map((col) => (col.name === column.name ? { ...col, selected: !!checked } : col)),
                      )
                    }
                  />
                  <Label htmlFor={column.name} className="text-sm">
                    {column.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button 
          className="w-full" 
          disabled={isLoading || !selectedDatabase || !selectedTable || columns.filter(c => c.selected).length === 0}
          onClick={handleORCIDSearch}
        >
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          {isLoading ? "Searching ORCID..." : "Start ORCID Search"}
        </Button>

        {/* Show Previous Results Button */}
        {persistedResearcherRows.length > 0 && (
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={showSavedResults}
            disabled={isLoading}
          >
            <Eye className="mr-2 h-4 w-4" />
            Show Previous Results ({persistedResearcherRows.length} from "{persistedTableName}")
          </Button>
        )}

        {isLoading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>
                {progressDetails?.status || 'Processing researchers...'}
                {progressDetails?.current_researcher && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Current: {progressDetails.current_researcher}
                  </div>
                )}
                {progressDetails?.substatus && (
                  <div className="text-xs text-blue-600 mt-1">
                    {progressDetails.substatus}
                  </div>
                )}
              </span>
              <span>
                {progressDetails ? 
                  `${progressDetails.current}/${progressDetails.total} (${progress}%)` : 
                  `${progress}%`
                }
              </span>
            </div>
            <Progress value={progress} />
          </div>
        )}
      </CardContent>
    </Card>

    {/* ORCID Results Modal */}
    {researcherRows.length > 0 && (
      <Dialog open={true} onOpenChange={() => setResearcherRows([])}>
        <DialogContent className="max-w-[95vw] h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center space-x-2">
              <Search className="h-5 w-5" />
              <span>ORCID Search Results</span>
            </DialogTitle>
            <DialogDescription>
              Search results from table "{selectedTable}" - {researcherRows.length} rows processed
            </DialogDescription>
          </DialogHeader>
          
          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="space-y-4 flex-shrink-0">
              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {filterResearchers(researcherRows, filterText, columns).length}
                  </div>
                  <div className="text-sm text-blue-600">{filterText ? 'Filtered' : 'Total'} Rows</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {filterResearchers(researcherRows, filterText, columns).filter(r => r.orcidStatus === 'found').length}
                  </div>
                  <div className="text-sm text-green-600">ORCID Found</div>
                </div>
                <div className="bg-yellow-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">
                    {filterResearchers(researcherRows, filterText, columns).filter(r => r.orcidStatus === 'pending').length}
                  </div>
                  <div className="text-sm text-yellow-600">Pending</div>
                </div>
                <div className="bg-red-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {filterResearchers(researcherRows, filterText, columns).filter(r => r.orcidStatus === 'not_found').length}
                  </div>
                  <div className="text-sm text-red-600">Not Found</div>
                </div>
              </div>

              {/* Filter Input */}
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter researchers by any column..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="flex-1"
                />
                {filterText && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilterText("")}
                    title="Clear filter"
                  >
                    ✕
                  </Button>
                )}
              </div>
            </div>

            {/* Results Table - Scrollable */}
            <div className="flex-1 overflow-hidden mt-4">
              <ScrollArea className="h-full w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={
                            (() => {
                              const filteredResearchers = filterResearchers(researcherRows, filterText, columns)
                              return filteredResearchers.length > 0 && filteredResearchers.every(r => r.selected)
                            })()
                          }
                          onCheckedChange={(checked) => {
                            console.log(`Select All toggled to: ${checked}`)
                            const filteredResearchers = filterResearchers(researcherRows, filterText, columns)
                            const filteredIds = new Set(filteredResearchers.map(r => r.id))
                            console.log('Filtered researcher IDs:', Array.from(filteredIds))
                            setResearcherRows(prev => {
                              const updated = prev.map(r => 
                                filteredIds.has(r.id) 
                                  ? { ...r, selected: !!checked } 
                                  : r
                              )
                              console.log('Updated from Select All:', updated.map(r => ({ id: r.id, name: `${r.prenom} ${r.nom}`, selected: r.selected })))
                              return updated
                            })
                          }}
                          title="Select All"
                        />
                      </TableHead>
                      {/* Dynamic columns based on selected columns */}
                      {columns.filter(c => c.selected).map((column) => (
                        <TableHead key={column.name}>{column.name}</TableHead>
                      ))}
                      <TableHead>ORCID ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Main Research Fields</TableHead>
                      <TableHead>Research Keywords</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                  {filterResearchers(researcherRows, filterText, columns).map((researcher, index) => (
                    <TableRow key={researcher.id}>
                      <TableCell>
                        <Checkbox
                          checked={researcher.selected}
                          onCheckedChange={(checked) => {
                            console.log(`Toggling researcher ${researcher.id}: ${researcher.prenom} ${researcher.nom} to ${checked}`)
                            setResearcherRows((prev) => {
                              const updated = prev.map((r) => (r.id === researcher.id ? { ...r, selected: !!checked } : r))
                              console.log('Updated researcher rows:', updated.map(r => ({ id: r.id, name: `${r.prenom} ${r.nom}`, selected: r.selected })))
                              return updated
                            })
                          }}
                        />
                      </TableCell>
                      {/* Dynamic columns - show original data from table */}
                      {columns.filter(c => c.selected).map((column) => (
                        <TableCell key={column.name}>
                          {/* Display data using original data if available, fallback to mapped data */}
                          {researcher.originalData && researcher.originalData[column.name] 
                            ? String(researcher.originalData[column.name] || 'N/A')
                            : column.name.toLowerCase().includes('first') || column.name.toLowerCase().includes('prenom') 
                            ? decodeUnicode(researcher.first_name || researcher.prenom || '')
                            : column.name.toLowerCase().includes('last') || column.name.toLowerCase().includes('nom')
                            ? decodeUnicode(researcher.last_name || researcher.nom || '')
                            : column.name.toLowerCase().includes('affiliation') || column.name.toLowerCase().includes('institution')
                            ? decodeUnicode(researcher.affiliation)
                            : column.name.toLowerCase().includes('email')
                            ? researcher.email || 'N/A'
                            : column.name.toLowerCase().includes('country')
                            ? researcher.country || 'N/A'
                            : 'N/A'  // Default for unknown columns
                          }
                        </TableCell>
                      ))}
                      <TableCell>
                        {researcher.orcid ? (
                          <a 
                            href={`https://orcid.org/${researcher.orcid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {researcher.orcid}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">Not found</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            researcher.orcidStatus === "found"
                              ? "default"
                              : researcher.orcidStatus === "pending"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {researcher.orcidStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {researcher.confidence !== undefined ? (
                          <div className="flex items-center space-x-2">
                            <div className="w-16 bg-gray-200 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${
                                  researcher.confidence >= 0.8 ? 'bg-green-500' :
                                  researcher.confidence >= 0.6 ? 'bg-yellow-500' :
                                  'bg-red-500'
                                }`}
                                style={{ width: `${researcher.confidence * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {Math.round(researcher.confidence * 100)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {/* Main Research Fields */}
                        {researcher.mainResearchFields && researcher.mainResearchFields.length > 0 ? (
                          <div className="space-y-1">
                            {/* Show fields based on expansion state */}
                            {(expandedFields[researcher.id] ? researcher.mainResearchFields : researcher.mainResearchFields.slice(0, 3)).map((field, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs mr-1 mb-1">
                                {field}
                              </Badge>
                            ))}
                            {/* Show expand/collapse button if there are more than 3 fields */}
                            {researcher.mainResearchFields.length > 3 && (
                              <Badge 
                                variant="secondary" 
                                className="text-xs cursor-pointer hover:bg-secondary/80 transition-colors"
                                onClick={() => {
                                  setExpandedFields(prev => ({
                                    ...prev,
                                    [researcher.id]: !prev[researcher.id]
                                  }))
                                }}
                                title={expandedFields[researcher.id] ? "Show less" : "Show all fields"}
                              >
                                {expandedFields[researcher.id] 
                                  ? "Show less" 
                                  : `+${researcher.mainResearchFields.length - 3} more`
                                }
                              </Badge>
                            )}
                          </div>
                        ) : researcher.orcid ? (
                          <span className="text-xs text-muted-foreground">No fields found</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No ORCID</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {/* Research Keywords */}
                        {researcher.researchKeywords && researcher.researchKeywords.length > 0 ? (
                          <div className="space-y-1">
                            {/* Show keywords based on expansion state */}
                            {(expandedKeywords[researcher.id] ? researcher.researchKeywords : researcher.researchKeywords.slice(0, 4)).map((keyword, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs mr-1 mb-1">
                                {keyword}
                              </Badge>
                            ))}
                            {/* Show expand/collapse button if there are more than 4 keywords */}
                            {researcher.researchKeywords.length > 4 && (
                              <Badge 
                                variant="outline" 
                                className="text-xs cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => {
                                  setExpandedKeywords(prev => ({
                                    ...prev,
                                    [researcher.id]: !prev[researcher.id]
                                  }))
                                }}
                                title={expandedKeywords[researcher.id] ? "Show less" : "Show all keywords"}
                              >
                                {expandedKeywords[researcher.id] 
                                  ? "Show less" 
                                  : `+${researcher.researchKeywords.length - 4} more`
                                }
                              </Badge>
                            )}
                          </div>
                        ) : researcher.orcid ? (
                          <span className="text-xs text-muted-foreground">No keywords found</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No ORCID</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {/* Show reasoning from the new API response */}
                        {researcher.reasoning ? (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground max-w-[200px] line-clamp-3">
                              {researcher.reasoning}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {researcher.notes || 'No analysis available'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-1">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            title="View ORCID Profile"
                            onClick={() => {
                              console.log("Eye icon clicked:", researcher)
                              console.log("ORCID ID:", researcher.orcid)
                              console.log("ORCID Status:", researcher.orcidStatus)
                              
                              if (researcher.orcid) {
                                console.log("Setting ORCID profile modal state...")
                                setSelectedOrcidId(researcher.orcid)
                                setSelectedResearcherName(`${researcher.prenom} ${researcher.nom}`)
                                setOrcidProfileModalOpen(true)
                                console.log("Modal should be opening now...")
                              } else {
                                console.log("No ORCID ID found for researcher")
                                toast({
                                  title: "No ORCID ID",
                                  description: "This researcher doesn't have an ORCID ID to view profile",
                                  variant: "destructive",
                                })
                              }
                            }}
                            disabled={!researcher.orcid}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {/* <Button 
                            size="sm" 
                            variant="outline"
                            title="Verify ORCID"
                            disabled={!researcher.orcid}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button> */}
                          {/* Search Again Button for Not Found */}
                          {researcher.orcidStatus === 'not_found' && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              title="Search Again"
                              onClick={async () => {
                                try {
                                  console.log("Searching again for researcher:", researcher)
                                  
                                  // Update status to pending
                                  setResearcherRows(prev => 
                                    prev.map(r => 
                                      r.id === researcher.id 
                                        ? { ...r, orcidStatus: 'pending' as const }
                                        : r
                                    )
                                  )

                                  // Get current LLM config
                                  const getCurrentLLMConfig = (): LLMConfig | undefined => {
                                    const selectedModelInfo = aiModels.find(m => m.value === selectedModel)
                                    if (!selectedModelInfo) return undefined

                                    const apiKey = apiKeys[selectedModelInfo.provider as keyof typeof apiKeys]
                                    if (!apiKey) return undefined

                                    return {
                                      model_name: selectedModel,
                                      api_key: apiKey,
                                      provider: "litellm"
                                    }
                                  }

                                  const llmConfig = getCurrentLLMConfig()
                                  if (!llmConfig) {
                                    toast({
                                      title: "Error",
                                      description: "Please configure API keys first",
                                      variant: "destructive",
                                    })
                                    return
                                  }

                                  // Call the individual ORCID search endpoint
                                  const searchResponse = await dataManagementService.searchIndividualORCID({
                                    first_name: researcher.prenom,
                                    last_name: researcher.nom,
                                    affiliation: researcher.affiliation,
                                    email: researcher.email || "",
                                    llm_config: {
                                      model_name: selectedModel,
                                      api_key: llmConfig.api_key,
                                      provider: llmConfig.provider ?? "",
                                    }
                                  })

                                  // searchResponse is already the parsed result from the service
                                  const result = searchResponse

                                  // Update the researcher row with new results
                                  setResearcherRows(prev => 
                                    prev.map(r => 
                                      r.id === researcher.id 
                                        ? { 
                                            ...r, 
                                            orcid: result.orcid_id || "",
                                            orcidStatus: result.orcid_id ? 'found' as const : 'not_found' as const,
                                            matchDetails: result.match_details ? {
                                              confidence: result.match_details.confidence || "low",
                                              matchReasons: result.match_details.reasons || [],
                                              doubtReasons: result.match_details.doubts || [],
                                              profileData: result.profile_data
                                            } : undefined,
                                            mainResearchFields: result.main_research_fields || [],
                                            researchKeywords: result.research_keywords || [],
                                            extractionStatus: result.extraction_status || "completed",
                                            notes: result.match_details?.reasons?.join(', ') || "Re-searched"
                                          }
                                        : r
                                    )
                                  )

                                  toast({
                                    title: result.orcid_id ? "ORCID Found!" : "Still Not Found",
                                    description: result.orcid_id 
                                      ? `Found ORCID ID: ${result.orcid_id}` 
                                      : "No ORCID ID found for this researcher",
                                    variant: result.orcid_id ? "default" : "destructive"
                                  })
                                } catch (error: any) {
                                  console.error("Failed to search again:", error)
                                  setResearcherRows(prev => 
                                    prev.map(r => 
                                      r.id === researcher.id 
                                        ? { ...r, orcidStatus: 'not_found' as const }
                                        : r
                                    )
                                  )
                                  toast({
                                    title: "Search Failed",
                                    description: error.message || "Failed to search for ORCID",
                                    variant: "destructive",
                                  })
                                }
                              }}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </ScrollArea>
            </div>

            {/* Action Buttons - Fixed at bottom */}
            <div className="flex-shrink-0 flex justify-between items-center pt-4 border-t mt-4">
              <div className="flex space-x-2">
                <Button 
                  variant={filterText ? "default" : "outline"} 
                  size="sm"
                  onClick={() => {
                    if (filterText) {
                      setFilterText("")
                    } else {
                      // Quick filter for ORCID found
                      setFilterText("found")
                    }
                  }}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  {filterText ? "Clear Filter" : "Show ORCID Found"}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    // Get filtered researchers
                    const filteredResearchers = filterResearchers(researcherRows, filterText, columns)
                    const allFilteredSelected = filteredResearchers.every(r => r.selected)
                    const filteredIds = new Set(filteredResearchers.map(r => r.id))
                    
                    setResearcherRows(prev => 
                      prev.map(r => ({
                        ...r,
                        selected: filteredIds.has(r.id) ? !allFilteredSelected : r.selected
                      }))
                    )
                  }}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {(() => {
                    const filteredResearchers = filterResearchers(researcherRows, filterText, columns)
                    const allFilteredSelected = filteredResearchers.every(r => r.selected)
                    return allFilteredSelected ? 'Deselect' : 'Select'
                  })()} {filterText ? 'Filtered' : 'All'}
                </Button>
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={exportToCSV}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  title={`Export ${researcherRows.filter(r => r.selected).length > 0 ? 'selected' : 'all'} researchers to CSV`}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export to CSV ({researcherRows.filter(r => r.selected).length > 0 ? researcherRows.filter(r => r.selected).length : researcherRows.length})
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={extractResearchFieldsForAll}
                  disabled={researcherRows.filter(r => r.orcid && !r.mainResearchFields?.length).length === 0}
                  title="Extract research fields and keywords for researchers with ORCID IDs"
                >
                  <BookOpen className="mr-2 h-4 w-4" />
                  Extract Research Fields ({researcherRows.filter(r => r.orcid && !r.mainResearchFields?.length).length})
                </Button>
              </div>
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => setResearcherRows([])}
                >
                  Close
                </Button>
                <Button 
                  onClick={saveSelectedResearchers}
                  disabled={researcherRows.filter(r => r.selected).length === 0}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Save Selected ({researcherRows.filter(r => r.selected).length})
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )}
  </div>
)

interface TableOrcidSearchProps {
  databases: DatabaseConnection[]
  selectedDatabase: string
  setSelectedDatabase: (value: string) => Promise<void>
  tables: string[]
  selectedTable: string
  setSelectedTable: (value: string) => void
  columns: TableColumn[]
  setColumns: (value: TableColumn[] | ((prev: TableColumn[]) => TableColumn[])) => void
  handleLoadSchema: (id: string) => void
  handleTableOrcidSearch: () => void
  isLoading: boolean
  progress: number
  progressDetails: {
    current: number
    total: number
    status: string
    current_researcher?: string
    substatus?: string
  } | null
  researcherRows: ResearcherRow[]
  setResearcherRows: (value: ResearcherRow[] | ((prev: ResearcherRow[]) => ResearcherRow[])) => void
  // Add ORCID Profile Modal props
  setOrcidProfileModalOpen: (open: boolean) => void
  setSelectedOrcidId: (id: string) => void
  setSelectedResearcherName: (name: string) => void
  // Add props needed for search again functionality
  selectedModel: string
  setSelectedModel: (model: string) => void
  apiKeys: { openai: string; gemini: string; deepseek: string }
  // Add CSV export functionality
  exportToCSV: () => void
  // Add persistent results props
  showSavedResults: () => void
  persistedResearcherRows: ResearcherRow[]
  persistedTableName: string
  // Add save functionality
  saveSelectedResearchers: () => void
  // Add filter functionality
  filterText: string
  setFilterText: (value: string) => void
  // Add research fields extraction
  extractResearchFieldsForAll: () => void
  // Add expansion state props
  expandedFields: Record<string, boolean>
  setExpandedFields: (value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void
  expandedKeywords: Record<string, boolean>
  setExpandedKeywords: (value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void
}

const TableOrcidSearch = ({
  databases,
  selectedDatabase,
  setSelectedDatabase,
  tables,
  selectedTable,
  setSelectedTable,
  columns,
  setColumns,
  handleLoadSchema,
  handleTableOrcidSearch,
  isLoading,
  progress,
  progressDetails,
  researcherRows,
  setResearcherRows,
  setOrcidProfileModalOpen,
  setSelectedOrcidId,
  setSelectedResearcherName,
  selectedModel,
  setSelectedModel,
  apiKeys,
  exportToCSV,
  showSavedResults,
  persistedResearcherRows,
  persistedTableName,
  saveSelectedResearchers,
  filterText,
  setFilterText,
  extractResearchFieldsForAll,
  expandedFields,
  setExpandedFields,
  expandedKeywords,
  setExpandedKeywords
}: TableOrcidSearchProps) => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Search className="h-5 w-5" />
          <span>Table ORCID Search</span>
        </CardTitle>
        <CardDescription>Select database, table, and columns to search for ORCID IDs using DeepSeek agent directly</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="select-database">Select Database</Label>
            <Select value={selectedDatabase} onValueChange={setSelectedDatabase}>
              <SelectTrigger>
                <SelectValue placeholder="Choose database" />
              </SelectTrigger>
              <SelectContent>
                {databases.map((db) => (
                  <SelectItem key={db.id} value={db.id}>
                    {db.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="select-table">Select Table</Label>
            <Select value={selectedTable} onValueChange={setSelectedTable}>
              <SelectTrigger>
                <SelectValue placeholder="Choose table" />
              </SelectTrigger>
              <SelectContent>
                {tables.map((table) => (
                  <SelectItem key={table} value={table}>
                    {table}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Button 
              variant="outline"
              className="mt-6" 
              onClick={() => selectedDatabase && handleLoadSchema(selectedDatabase)}
              disabled={!selectedDatabase || isLoading}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Schema
            </Button>
          </div>
        </div>

        {/* AI Model Selection */}
        <div>
          <Label htmlFor="model-select">Select AI Model</Label>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger>
              <SelectValue placeholder="Choose AI model" />
            </SelectTrigger>
            <SelectContent>
              {aiModels.map((model) => (
                <SelectItem key={model.value} value={model.value}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Choose the AI model for DeepSeek ORCID search and analysis
          </p>
        </div>

        {columns.length > 0 && (
          <div>
            <Label>Select Columns for ORCID Search</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
              {columns.map((column) => (
                <div key={column.name} className="flex items-center space-x-2">
                  <Checkbox
                    id={column.name}
                    checked={column.selected}
                    onCheckedChange={(checked) =>
                      setColumns((prev) =>
                        prev.map((col) => (col.name === column.name ? { ...col, selected: !!checked } : col)),
                      )
                    }
                  />
                  <Label htmlFor={column.name} className="text-sm">
                    {column.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button 
          className="w-full" 
          disabled={isLoading || !selectedDatabase || !selectedTable || columns.filter(c => c.selected).length === 0}
          onClick={handleTableOrcidSearch}
        >
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          {isLoading ? "Searching ORCID ..." : "Start ORCID Search"}
        </Button>

        {/* Show Previous Results Button */}
        {persistedResearcherRows.length > 0 && (
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={showSavedResults}
            disabled={isLoading}
          >
            <Eye className="mr-2 h-4 w-4" />
            Show Previous Results ({persistedResearcherRows.length} from "{persistedTableName}")
          </Button>
        )}

        {isLoading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>
                {progressDetails?.status || 'Processing researchers with agent...'}
                {progressDetails?.current_researcher && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Current: {progressDetails.current_researcher}
                  </div>
                )}
                {progressDetails?.substatus && (
                  <div className="text-xs text-blue-600 mt-1">
                    {progressDetails.substatus}
                  </div>
                )}
              </span>
              <span>
                {progressDetails ? 
                  `${progressDetails.current}/${progressDetails.total} (${progress}%)` : 
                  `${progress}%`
                }
              </span>
            </div>
            <Progress value={progress} />
          </div>
        )}
      </CardContent>
    </Card>

    {/* ORCID Results Modal */}
    {researcherRows.length > 0 && (
      <Dialog open={true} onOpenChange={() => {
        // Just close the modal - data is already saved when search completes
        setResearcherRows([])
      }}>
        <DialogContent className="max-w-[95vw] h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center space-x-2">
              <Search className="h-5 w-5" />
              <span>ORCID Search Results</span>
            </DialogTitle>
            <DialogDescription>
              Search results from table "{selectedTable}" using our agent - {researcherRows.length} rows processed
            </DialogDescription>
          </DialogHeader>
          
          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="space-y-4 flex-shrink-0">
              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {filterResearchers(researcherRows, filterText, columns).length}
                  </div>
                  <div className="text-sm text-blue-600">{filterText ? 'Filtered' : 'Total'} Rows</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {filterResearchers(researcherRows, filterText, columns).filter(r => r.orcidStatus === 'found').length}
                  </div>
                  <div className="text-sm text-green-600">ORCID Found</div>
                </div>
                <div className="bg-yellow-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">
                    {filterResearchers(researcherRows, filterText, columns).filter(r => r.orcidStatus === 'pending').length}
                  </div>
                  <div className="text-sm text-yellow-600">Pending</div>
                </div>
                <div className="bg-red-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {filterResearchers(researcherRows, filterText, columns).filter(r => r.orcidStatus === 'not_found').length}
                  </div>
                  <div className="text-sm text-red-600">Not Found</div>
                </div>
              </div>

              {/* Filter Input */}
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter researchers by any column..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="flex-1"
                />
                {filterText && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilterText("")}
                    title="Clear filter"
                  >
                    ✕
                  </Button>
                )}
              </div>
            </div>

            {/* Results Table - Scrollable with Both Vertical and Horizontal Scroll */}
            <div className="flex-1 overflow-auto mt-4">
              <div className="min-h-0 overflow-auto">
                <div className="min-w-max">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 sticky left-0 bg-background z-10">
                          <Checkbox
                            checked={
                              (() => {
                                const filteredResearchers = filterResearchers(researcherRows, filterText, columns)
                                return filteredResearchers.length > 0 && filteredResearchers.every(r => r.selected)
                              })()
                            }
                            onCheckedChange={(checked) => {
                              console.log(`Select All toggled to: ${checked}`)
                              const filteredResearchers = filterResearchers(researcherRows, filterText, columns)
                              const filteredIds = new Set(filteredResearchers.map(r => r.id))
                              console.log('Filtered researcher IDs:', Array.from(filteredIds))
                              setResearcherRows(prev => {
                                const updated = prev.map(r => 
                                  filteredIds.has(r.id) 
                                    ? { ...r, selected: !!checked } 
                                    : r
                                )
                                console.log('Updated from Select All:', updated.map(r => ({ id: r.id, name: `${r.prenom} ${r.nom}`, selected: r.selected })))
                                return updated
                              })
                            }}
                            title="Select All"
                          />
                        </TableHead>
                        {/* Dynamic columns based on selected columns */}
                        {columns.filter(c => c.selected).map((column) => (
                          <TableHead key={column.name} className="min-w-[120px]">{column.name}</TableHead>
                        ))}
                        <TableHead className="min-w-[150px]">ORCID ID</TableHead>
                        <TableHead className="min-w-[100px]">Status</TableHead>
                        <TableHead className="min-w-[120px]">Confidence</TableHead>
                        <TableHead className="min-w-[200px]">Main Research Fields</TableHead>
                        <TableHead className="min-w-[200px]">Research Keywords</TableHead>
                        <TableHead className="min-w-[200px]">Notes</TableHead>
                        <TableHead className="min-w-[280px] sticky right-0 bg-background z-10">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                    {filterResearchers(researcherRows, filterText, columns).map((researcher, index) => (
                      <TableRow key={researcher.id}>
                        <TableCell className="sticky left-0 bg-background z-10">
                          <Checkbox
                            checked={researcher.selected}
                            onCheckedChange={(checked) => {
                              console.log(`Toggling researcher ${researcher.id}: ${researcher.prenom} ${researcher.nom} to ${checked}`)
                              setResearcherRows((prev) => {
                                const updated = prev.map((r) => (r.id === researcher.id ? { ...r, selected: !!checked } : r))
                                console.log('Updated researcher rows:', updated.map(r => ({ id: r.id, name: `${r.prenom} ${r.nom}`, selected: r.selected })))
                                return updated
                              })
                            }}
                          />
                        </TableCell>
                        {/* Dynamic columns - show original data from table */}
                        {columns.filter(c => c.selected).map((column) => (
                          <TableCell key={column.name} className="min-w-[120px]">
                            {/* Display data using original data if available, fallback to mapped data */}
                            {researcher.originalData && researcher.originalData[column.name] 
                              ? String(researcher.originalData[column.name] || 'N/A')
                              : column.name.toLowerCase().includes('first') || column.name.toLowerCase().includes('prenom') 
                              ? decodeUnicode(researcher.first_name || researcher.prenom || '')
                              : column.name.toLowerCase().includes('last') || column.name.toLowerCase().includes('nom')
                              ? decodeUnicode(researcher.last_name || researcher.nom || '')
                              : column.name.toLowerCase().includes('affiliation') || column.name.toLowerCase().includes('institution')
                              ? decodeUnicode(researcher.affiliation)
                              : column.name.toLowerCase().includes('email')
                              ? researcher.email || 'N/A'
                              : column.name.toLowerCase().includes('country')
                              ? researcher.country || 'N/A'
                              : 'N/A'  // Default for unknown columns
                            }
                          </TableCell>
                        ))}
                        <TableCell className="min-w-[150px]">
                          {researcher.orcid ? (
                            <a 
                              href={`https://orcid.org/${researcher.orcid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {researcher.orcid}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">Not found</span>
                          )}
                        </TableCell>
                        <TableCell className="min-w-[100px]">
                          <Badge
                            variant={
                              researcher.orcidStatus === "found"
                                ? "default"
                                : researcher.orcidStatus === "pending"
                                  ? "secondary"
                                  : "destructive"
                            }
                          >
                            {researcher.orcidStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="min-w-[120px]">
                          {researcher.confidence !== undefined ? (
                            <div className="flex items-center space-x-2">
                              <div className="w-16 bg-gray-200 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full ${
                                    researcher.confidence >= 0.8 ? 'bg-green-500' :
                                    researcher.confidence >= 0.6 ? 'bg-yellow-500' :
                                    'bg-red-500'
                                  }`}
                                  style={{ width: `${researcher.confidence * 100}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {Math.round(researcher.confidence * 100)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="min-w-[200px]">
                          {/* Main Research Fields */}
                          {researcher.mainResearchFields && researcher.mainResearchFields.length > 0 ? (
                            <div className="space-y-1">
                              {/* Show fields based on expansion state */}
                              {(expandedFields[researcher.id] ? researcher.mainResearchFields : researcher.mainResearchFields.slice(0, 3)).map((field, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs mr-1 mb-1">
                                  {field}
                                </Badge>
                              ))}
                              {/* Show expand/collapse button if there are more than 3 fields */}
                              {researcher.mainResearchFields.length > 3 && (
                                <Badge 
                                  variant="secondary" 
                                  className="text-xs cursor-pointer hover:bg-secondary/80 transition-colors"
                                  onClick={() => {
                                    setExpandedFields(prev => ({
                                      ...prev,
                                      [researcher.id]: !prev[researcher.id]
                                    }))
                                  }}
                                  title={expandedFields[researcher.id] ? "Show less" : "Show all fields"}
                                >
                                  {expandedFields[researcher.id] 
                                    ? "Show less" 
                                    : `+${researcher.mainResearchFields.length - 3} more`
                                  }
                                </Badge>
                              )}
                            </div>
                          ) : researcher.orcid ? (
                            <span className="text-xs text-muted-foreground">No fields found</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No ORCID</span>
                          )}
                        </TableCell>
                        <TableCell className="min-w-[200px]">
                          {/* Research Keywords */}
                          {researcher.researchKeywords && researcher.researchKeywords.length > 0 ? (
                            <div className="space-y-1">
                              {/* Show keywords based on expansion state */}
                              {(expandedKeywords[researcher.id] ? researcher.researchKeywords : researcher.researchKeywords.slice(0, 4)).map((keyword, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs mr-1 mb-1">
                                  {keyword}
                                </Badge>
                              ))}
                              {/* Show expand/collapse button if there are more than 4 keywords */}
                              {researcher.researchKeywords.length > 4 && (
                                <Badge 
                                  variant="outline" 
                                  className="text-xs cursor-pointer hover:bg-muted/50 transition-colors"
                                  onClick={() => {
                                    setExpandedKeywords(prev => ({
                                      ...prev,
                                      [researcher.id]: !prev[researcher.id]
                                    }))
                                  }}
                                  title={expandedKeywords[researcher.id] ? "Show less" : "Show all keywords"}
                                >
                                  {expandedKeywords[researcher.id] 
                                    ? "Show less" 
                                    : `+${researcher.researchKeywords.length - 4} more`
                                  }
                                </Badge>
                              )}
                            </div>
                          ) : researcher.orcid ? (
                            <span className="text-xs text-muted-foreground">No keywords found</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No ORCID</span>
                          )}
                        </TableCell>
                        <TableCell className="min-w-[200px]">
                          {/* Show reasoning from the new API response */}
                          {researcher.reasoning ? (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground max-w-[200px] line-clamp-3">
                                {researcher.reasoning}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {researcher.notes || 'No analysis available'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="min-w-[280px] sticky right-0 bg-background z-10">
                          <div className="flex space-x-1">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              title="View ORCID Profile"
                              onClick={() => {
                                console.log("Eye icon clicked:", researcher)
                                console.log("ORCID ID:", researcher.orcid)
                                console.log("ORCID Status:", researcher.orcidStatus)
                                
                                if (researcher.orcid) {
                                  console.log("Setting ORCID profile modal state...")
                                  setSelectedOrcidId(researcher.orcid)
                                  setSelectedResearcherName(`${researcher.prenom} ${researcher.nom}`)
                                  setOrcidProfileModalOpen(true)
                                  console.log("Modal should be opening now...")
                                } else {
                                  console.log("No ORCID ID found for researcher")
                                  toast({
                                    title: "No ORCID ID",
                                    description: "This researcher doesn't have an ORCID ID to view profile",
                                    variant: "destructive",
                                  })
                                }
                              }}
                              disabled={!researcher.orcid}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {/* <Button 
                              size="sm" 
                              variant="outline"
                              title="Verify ORCID"
                              disabled={!researcher.orcid}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button> */}
                            {/* Search Again with Different Model - only show for not found */}
                            {researcher.orcidStatus === 'not_found' && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                title="Try with Different Model"
                                onClick={async () => {
                                  try {
                                    console.log("Trying with different model for researcher:", researcher)
                                    
                                    // Update status to pending
                                    setResearcherRows(prev => 
                                      prev.map(r => 
                                        r.id === researcher.id 
                                          ? { ...r, orcidStatus: 'pending' as const }
                                          : r
                                      )
                                    )

                                    // Format row data as colA:valA; colB:valB...
                                    const rowDataStr = Object.entries(researcher.originalData || {})
                                      .map(([key, value]) => `${key}:${value}`)
                                      .join('; ')

                                    // Call the table-person_v2 endpoint with different model
                                    const searchResponse = await fetch("http://localhost:8080/api/orcid/table-person_v2", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        researcher: {
                                          row_data: rowDataStr,
                                          nom: researcher.nom,
                                          prenom: researcher.prenom,
                                          affiliation: researcher.affiliation,
                                          email: researcher.email || ""
                                        },
                                        model_name: selectedModel,
                                        include_profile: true,
                                        works_limit: 5
                                      }),
                                    })

                                    if (!searchResponse.ok) {
                                      throw new Error(`HTTP ${searchResponse.status}: ${await searchResponse.text()}`)
                                    }

                                    const result = await searchResponse.json()

                                                                      // Update the researcher row with new results
                                  const updatedRows = researcherRows.map(r => 
                                    r.id === researcher.id 
                                      ? { 
                                          ...r, 
                                          orcid: result.orcid_id || "",
                                          orcidStatus: result.orcid_id ? 'found' as const : 'not_found' as const,
                                          first_name: result.first_name || r.first_name,
                                          last_name: result.last_name || r.last_name,
                                          email: result.email || r.email,
                                          country: result.country || r.country,
                                          affiliation: result.affiliation || r.affiliation,
                                          main_research_area: result.main_research_area || r.main_research_area,
                                          specific_research_area: result.specific_research_area || r.specific_research_area,
                                          mainResearchFields: result.main_research_area ? result.main_research_area.split(',').map((field: string) => field.trim()) : r.mainResearchFields,
                                          researchKeywords: result.specific_research_area ? result.specific_research_area.split(',').map((keyword: string) => keyword.trim()) : r.researchKeywords,
                                          reasoning: "Re-searched with different model",
                                          confidence: 0.7
                                        }
                                      : r
                                  )
                                  
                                  setResearcherRows(updatedRows)

                                    toast({
                                      title: result.orcid_id ? "ORCID Found!" : "Still Not Found",
                                      description: result.orcid_id 
                                        ? `Found ORCID ID: ${result.orcid_id} using ${selectedModel}` 
                                        : `No ORCID ID found using ${selectedModel}`,
                                      variant: result.orcid_id ? "default" : "destructive"
                                    })
                                  } catch (error: any) {
                                    console.error("Failed to search with different model:", error)
                                    setResearcherRows(prev => 
                                      prev.map(r => 
                                        r.id === researcher.id 
                                          ? { ...r, orcidStatus: 'not_found' as const }
                                          : r
                                      )
                                    )
                                    toast({
                                      title: "Search Failed",
                                      description: error.message || "Failed to search with different model",
                                      variant: "destructive",
                                    })
                                  }
                                }}
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            )}
                            {/* Search Again with Multi-Agent - only show for not found */}
                            {/* {researcher.orcidStatus === 'not_found' && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                title="Try with Multi-Agent Approach"
                                onClick={async () => {
                                  try {
                                    console.log("Trying with multi-agent approach for researcher:", researcher)
                                    
                                    // Update status to pending
                                    setResearcherRows(prev => 
                                      prev.map(r => 
                                        r.id === researcher.id 
                                          ? { ...r, orcidStatus: 'pending' as const }
                                          : r
                                      )
                                    )

                                    // Call the search-individual endpoint (multi-agent approach)
                                    const searchResponse = await fetch("http://localhost:8080/api/orcid/search-individual", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        researcher: {
                                          nom: researcher.nom,
                                          prenom: researcher.prenom,
                                          affiliation: researcher.affiliation,
                                          email: researcher.email || ""
                                        },
                                        model_name: selectedModel,
                                        include_profile: true,
                                        works_limit: 5
                                      }),
                                    })

                                    if (!searchResponse.ok) {
                                      throw new Error(`HTTP ${searchResponse.status}: ${await searchResponse.text()}`)
                                    }

                                    const result = await searchResponse.json()

                                                                      // Update the researcher row with new results
                                  const updatedRows = researcherRows.map(r => 
                                    r.id === researcher.id 
                                      ? { 
                                          ...r, 
                                          orcid: result.orcid_id || "",
                                          orcidStatus: result.orcid_id ? 'found' as const : 'not_found' as const,
                                          first_name: result.first_name || r.first_name,
                                          last_name: result.last_name || r.last_name,
                                          email: result.email || r.email,
                                          country: result.country || r.country,
                                          affiliation: result.affiliation || r.affiliation,
                                          main_research_area: result.main_research_area || r.main_research_area,
                                          specific_research_area: result.specific_research_area || r.specific_research_area,
                                          mainResearchFields: result.main_research_area ? result.main_research_area.split(',').map((field: string) => field.trim()) : r.mainResearchFields,
                                          researchKeywords: result.specific_research_area ? result.specific_research_area.split(',').map((keyword: string) => keyword.trim()) : r.researchKeywords,
                                          reasoning: "Re-searched with multi-agent approach",
                                          confidence: 0.8
                                        }
                                      : r
                                  )
                                  
                                                                    setResearcherRows(updatedRows)

                                  toast({
                                    title: result.orcid_id ? "ORCID Found!" : "Still Not Found",
                                    description: result.orcid_id 
                                      ? `Found ORCID ID: ${result.orcid_id} using multi-agent approach` 
                                      : `No ORCID ID found using multi-agent approach`,
                                    variant: result.orcid_id ? "default" : "destructive"
                                  })
                                  } catch (error: any) {
                                    console.error("Failed to search with multi-agent approach:", error)
                                    setResearcherRows(prev => 
                                      prev.map(r => 
                                        r.id === researcher.id 
                                          ? { ...r, orcidStatus: 'not_found' as const }
                                          : r
                                      )
                                    )
                                    toast({
                                      title: "Search Failed",
                                      description: error.message || "Failed to search with multi-agent approach",
                                      variant: "destructive",
                                    })
                                  }
                                }}
                              >
                                <Microscope className="h-4 w-4" />
                              </Button>
                            )} */}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </div>
            </div>

            {/* Action Buttons - Fixed at bottom */}
            <div className="flex-shrink-0 flex justify-between items-center pt-4 border-t mt-4">
              <div className="flex space-x-2">
                {/* <Button 
                  variant={filterText ? "default" : "outline"} 
                  size="sm"
                  onClick={() => {
                    if (filterText) {
                      setFilterText("")
                    } else {
                      // Quick filter for ORCID found
                      setFilterText("found")
                    }
                  }}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  {filterText ? "Clear Filter" : "Show ORCID Found"}
                </Button> */}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    // Get filtered researchers
                    const filteredResearchers = filterResearchers(researcherRows, filterText, columns)
                    const allFilteredSelected = filteredResearchers.every(r => r.selected)
                    const filteredIds = new Set(filteredResearchers.map(r => r.id))
                    
                    setResearcherRows(prev => 
                      prev.map(r => ({
                        ...r,
                        selected: filteredIds.has(r.id) ? !allFilteredSelected : r.selected
                      }))
                    )
                  }}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {(() => {
                    const filteredResearchers = filterResearchers(researcherRows, filterText, columns)
                    const allFilteredSelected = filteredResearchers.every(r => r.selected)
                    return allFilteredSelected ? 'Deselect' : 'Select'
                  })()} {filterText ? 'Filtered' : 'All'}
                </Button>
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={exportToCSV}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  title={`Export ${researcherRows.filter(r => r.selected).length > 0 ? 'selected' : 'all'} researchers to CSV`}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export to CSV ({researcherRows.filter(r => r.selected).length > 0 ? researcherRows.filter(r => r.selected).length : researcherRows.length})
                </Button>
                {/* <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={extractResearchFieldsForAll}
                  disabled={researcherRows.filter(r => r.orcid && !r.mainResearchFields?.length).length === 0}
                  title="Extract research fields and keywords for researchers with ORCID IDs"
                >
                  <BookOpen className="mr-2 h-4 w-4" />
                  Extract Research Fields ({researcherRows.filter(r => r.orcid && !r.mainResearchFields?.length).length})
                </Button> */}
              </div>
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => setResearcherRows([])}
                >
                  Close
                </Button>
                <Button 
                  onClick={saveSelectedResearchers}
                  disabled={researcherRows.filter(r => r.selected).length === 0}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Save Selected ({researcherRows.filter(r => r.selected).length})
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )}
  </div>
)

interface ResearcherMatchingProps {
  databases: DatabaseConnection[]
  selectedDatabase: string
  setSelectedDatabase: (value: string) => void
  isLoading: boolean
  progress: number
  // New props for single researcher ORCID search
  tables: string[]
  selectedTable: string
  setSelectedTable: (value: string) => void
  columns: TableColumn[]
  setColumns: (value: TableColumn[] | ((prev: TableColumn[]) => TableColumn[])) => void
  handleLoadSchema: (id: string) => void
  handleDatabaseSelection: (databaseId: string) => void
  handleTableSelection: (tableName: string) => void
  tableRows: any[]
  setTableRows: (value: any[] | ((prev: any[]) => any[])) => void
  searchSingleResearcherORCID: (researcherData: any) => Promise<any>
  setOrcidProfileModalOpen: (open: boolean) => void
  setSelectedOrcidId: (id: string) => void
  setSelectedResearcherName: (name: string) => void
  selectedModel: string
  setSelectedModel: (model: string) => void
  apiKeys: { openai: string; gemini: string; deepseek: string }
}

const ResearcherMatching = ({
  databases,
  selectedDatabase,
  setSelectedDatabase,
  isLoading,
  progress,
  // New props for single researcher ORCID search
  tables,
  selectedTable,
  setSelectedTable,
  columns,
  setColumns,
  handleLoadSchema,
  handleDatabaseSelection,
  handleTableSelection,
  tableRows,
  setTableRows,
  searchSingleResearcherORCID,
  setOrcidProfileModalOpen,
  setSelectedOrcidId,
  setSelectedResearcherName,
  selectedModel,
  setSelectedModel,
  apiKeys
}: ResearcherMatchingProps) => {
  // Add search state for table data
  const [tableSearchText, setTableSearchText] = useState("")
  
  // Filter table rows based on search text
  const filteredTableRows = useMemo(() => {
    if (!tableSearchText) return tableRows
    
    return tableRows.filter(row => {
      return Object.values(row).some(value => 
        String(value).toLowerCase().includes(tableSearchText.toLowerCase())
      )
    })
  }, [tableRows, tableSearchText])
  
  return (
  <div className="space-y-6">
    {/* Database and Table Selection */}
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Database className="h-5 w-5" />
          <span>Database & Table Selection</span>
        </CardTitle>
        <CardDescription>Select database, table, and columns to view researcher data</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="select-database">Select Database</Label>
            <Select value={selectedDatabase} onValueChange={handleDatabaseSelection}>
              <SelectTrigger>
                <SelectValue placeholder="Choose database" />
              </SelectTrigger>
              <SelectContent>
                {databases.map((db) => (
                  <SelectItem key={db.id} value={db.id}>
                    {db.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="select-table">Select Table</Label>
            <Select value={selectedTable} onValueChange={handleTableSelection}>
              <SelectTrigger>
                <SelectValue placeholder="Choose table" />
              </SelectTrigger>
              <SelectContent>
                {tables.map((table) => (
                  <SelectItem key={table} value={table}>
                    {table}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Button 
              variant="outline"
              className="mt-6" 
              onClick={() => selectedDatabase && handleLoadSchema(selectedDatabase)}
              disabled={!selectedDatabase || isLoading}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Schema
            </Button>
          </div>
        </div>

        {/* AI Model Selection */}
        <div>
          <Label htmlFor="model-select">Select AI Model</Label>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger>
              <SelectValue placeholder="Choose AI model" />
            </SelectTrigger>
            <SelectContent>
              {aiModels.map((model) => (
                <SelectItem key={model.value} value={model.value}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Choose the AI model for researcher matching and analysis
          </p>
        </div>

        {columns.length > 0 && (
          <div>
            <Label>Select Columns to Display</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
              {columns.map((column) => (
                <div key={column.name} className="flex items-center space-x-2">
                  <Checkbox
                    id={column.name}
                    checked={column.selected}
                    onCheckedChange={(checked) =>
                      setColumns((prev) =>
                        prev.map((col) => (col.name === column.name ? { ...col, selected: !!checked } : col)),
                      )
                    }
                  />
                  <Label htmlFor={column.name} className="text-sm">
                    {column.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button 
          className="w-full" 
          disabled={isLoading || !selectedDatabase || !selectedTable || columns.filter(c => c.selected).length === 0}
          onClick={async () => {
            try {
              const selectedColumns = columns.filter(c => c.selected).map(c => c.name)
              
              // Call the data management service to get table data
              const response = await fetch("http://localhost:8080/api/databases/tables/select", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  db_id: selectedDatabase, // Keep as string as expected by the API
                  table_name: selectedTable,
                  columns: selectedColumns,
                  limit: 100 // Limit to 100 rows for performance
                }),
              })

              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`)
              }

              const result = await response.json()
              setTableRows(result.rows || [])
              
              toast({
                title: "Success",
                description: `Loaded ${result.rows?.length || 0} rows from table "${selectedTable}"`,
              })
            } catch (error: any) {
              console.error("Failed to load table data:", error)
              toast({
                title: "Error",
                description: error.message || "Failed to load table data",
                variant: "destructive",
              })
            }
          }}
        >
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
          {isLoading ? "Loading Table Data..." : "Load Table Data"}
        </Button>
      </CardContent>
    </Card>

    {/* Table Data Display */}
    {tableRows.length > 0 && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span>Table Data: {selectedTable}</span>
            <Table className="h-5 w-5" />
            {/* <span>Table Data: {selectedTable}</span> */}
          </CardTitle>
          <CardDescription>
            Showing {Math.min(filteredTableRows.length, 20)} of {filteredTableRows.length} rows (from {tableRows.length} total). Click "Search ORCID" to find ORCID ID for individual researchers.
          </CardDescription>
          
          {/* Search Input */}
          <div className="flex items-center space-x-2 mt-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search in all columns..."
              value={tableSearchText}
              onChange={(e) => setTableSearchText(e.target.value)}
              className="flex-1"
            />
            {tableSearchText && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTableSearchText("")}
                title="Clear search"
              >
                ✕
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Actions</TableHead>
                  {columns.filter(c => c.selected).map((column) => (
                    <TableHead key={column.name}>{column.name}</TableHead>
                  ))}
                  <TableHead>ORCID ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Main Research Area</TableHead>
                  <TableHead>Specific Research Area</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTableRows.slice(0, 20).map((row, index) => (
                  <TableRow key={`${row.id || index}-${row.nom || row.first_name || ''}-${row.prenom || row.last_name || ''}`}>
                    <TableCell>
                      <div className="flex space-x-1">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={async () => {
                            console.log("Search button clicked for row:", row)
                            console.log("Selected model:", selectedModel)
                            
                            // Set loading state for this specific row using unique identifier
                            const loadingRowId = `${row.id || ''}-${row.nom || row.first_name || ''}-${row.prenom || row.last_name || ''}`
                            const requestId = Date.now() + Math.random() // Unique request ID
                            
                            try {
                              setTableRows((prevRows: any[]) => {
                                return prevRows.map((prevRow: any) => {
                                  const prevRowId = `${prevRow.id || ''}-${prevRow.nom || prevRow.first_name || ''}-${prevRow.prenom || prevRow.last_name || ''}`
                                  
                                  if (loadingRowId === prevRowId) {
                                    return {
                                      ...prevRow,
                                      orcid_status: 'pending',
                                      requestId: requestId // Add unique request ID
                                    }
                                  }
                                  return prevRow
                                })
                              })

                              // Check if model is selected
                              if (!selectedModel) {
                                // Reset loading state on error
                                const errorRows = [...tableRows]
                                errorRows[index] = {
                                  ...row,
                                  orcid_status: 'not_found'
                                }
                                setTableRows(errorRows)
                                
                                toast({
                                  title: "Error",
                                  description: "Please select an AI model first",
                                  variant: "destructive",
                                })
                                return
                              }

                              console.log("Sending request to backend with data:", {
                                researcher: row,
                                model_name: selectedModel
                              })
                              
                              // Call the new table-person_v2 endpoint for DeepSeek support
                              const searchResponse = await fetch("http://localhost:8080/api/orcid/table-person_v2", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  researcher: row,
                                  model_name: selectedModel
                                }),
                              })

                              console.log("Response status:", searchResponse.status)
                              
                              if (!searchResponse.ok) {
                                const errorText = await searchResponse.text()
                                console.error("Backend error response:", errorText)
                                throw new Error(`HTTP ${searchResponse.status}: ${errorText}`)
                              }

                              const result = await searchResponse.json()
                              console.log("Backend response:", result)

                              // Update the row with ORCID results using unique identifier and request ID
                              const resultRowId = `${row.id || ''}-${row.nom || row.first_name || ''}-${row.prenom || row.last_name || ''}`
                              setTableRows((prevRows: any[]) => {
                                return prevRows.map((prevRow: any) => {
                                  const prevRowId = `${prevRow.id || ''}-${prevRow.nom || prevRow.first_name || ''}-${prevRow.prenom || prevRow.last_name || ''}`
                                  
                                  if (resultRowId === prevRowId && prevRow.requestId === requestId) {
                                    return {
                                      ...prevRow,
                                      orcid_id: result.orcid_id || null,
                                      orcid_status: result.orcid_id ? 'found' : 'not_found',
                                      first_name: result.first_name || '',
                                      last_name: result.last_name || '',
                                      email: result.email || '',
                                      country: result.country || '',
                                      affiliation: result.affiliation || '',
                                      main_research_area: result.main_research_area || '',
                                      specific_research_area: result.specific_research_area || ''
                                    }
                                  }
                                  return prevRow
                                })
                              })

                              // Show success/error message
                              if (result.orcid_id) {
                                toast({
                                  title: "ORCID Found!",
                                  description: `Found ORCID ID: ${result.orcid_id} for ${result.first_name} ${result.last_name}`,
                                })
                              } else {
                                toast({
                                  title: "No ORCID Found",
                                  description: "No ORCID ID found for this researcher",
                                  variant: "destructive",
                                })
                              }
                            } catch (error: any) {
                              console.error("Failed to search ORCID:", error)
                              
                              // Reset loading state on error using functional update
                              const errorRowId = `${row.id || ''}-${row.nom || row.first_name || ''}-${row.prenom || row.last_name || ''}`
                              setTableRows((prevRows: any[]) => {
                                return prevRows.map((prevRow: any) => {
                                  const prevRowId = `${prevRow.id || ''}-${prevRow.nom || prevRow.first_name || ''}-${prevRow.prenom || prevRow.last_name || ''}`
                                  
                                  if (errorRowId === prevRowId && prevRow.requestId === requestId) {
                                    return {
                                      ...prevRow,
                                      orcid_status: 'not_found'
                                    }
                                  }
                                  return prevRow
                                })
                              })
                              
                              toast({
                                title: "Search Failed",
                                description: error.message || "Failed to search for ORCID",
                                variant: "destructive",
                              })
                            }
                          }}
                          disabled={row.orcid_status === 'pending' || isLoading}
                        >
                          {row.orcid_status === 'pending' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Search className="h-4 w-4" />
                          )}
                        </Button>
                        
                        {/* Save to Researchers Button - only show if ORCID is found */}
                        {row.orcid_id && row.orcid_status === 'found' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={async () => {
                              try {
                                // Prepare researcher data for saving
                                const researcherData = {
                                  nom: row.last_name || row.nom || '',
                                  prenom: row.first_name || row.prenom || '',
                                  affiliation: row.affiliation || '',
                                  orcid_id: row.orcid_id,
                                  domaine_recherche: row.main_research_area || '',
                                  mots_cles_specifiques: row.specific_research_area || ''
                                }

                                // Check if researcher already exists by ORCID
                                const checkResponse = await fetch("http://localhost:8020/api/v1/chercheurs/check-orcid", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    orcid_id: row.orcid_id
                                  }),
                                })

                                if (checkResponse.ok) {
                                  const checkResult = await checkResponse.json()
                                  
                                  if (checkResult.exists) {
                                    // Ask for confirmation to overwrite
                                    const shouldOverwrite = window.confirm(
                                      `A researcher with ORCID ${row.orcid_id} already exists in the database.\n\n` +
                                      `Existing: ${checkResult.researcher.prenom} ${checkResult.researcher.nom}\n` +
                                      `New: ${researcherData.prenom} ${researcherData.nom}\n\n` +
                                      `Would you like to overwrite the existing researcher?`
                                    )
                                    
                                    if (shouldOverwrite) {
                                      // Call overwrite endpoint
                                      const overwriteResponse = await fetch("http://localhost:8020/api/v1/chercheurs/overwrite", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          chercheurs: [researcherData]
                                        }),
                                      })
                                      
                                      if (overwriteResponse.ok) {
                                        const overwriteResult = await overwriteResponse.json()
                                        toast({
                                          title: "Researcher Updated",
                                          description: `Successfully updated researcher ${researcherData.prenom} ${researcherData.nom} in the database.`,
                                        })
                                      } else {
                                        throw new Error(`Failed to overwrite: ${await overwriteResponse.text()}`)
                                      }
                                    }
                                  } else {
                                    // Save new researcher
                                    const saveResponse = await fetch("http://localhost:8020/api/v1/chercheurs/save", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        chercheurs: [researcherData]
                                      }),
                                    })
                                    
                                    if (saveResponse.ok) {
                                      const saveResult = await saveResponse.json()
                                      toast({
                                        title: "Researcher Saved",
                                        description: `Successfully saved researcher ${researcherData.prenom} ${researcherData.nom} to the database.`,
                                      })
                                    } else {
                                      throw new Error(`Failed to save: ${await saveResponse.text()}`)
                                    }
                                  }
                                } else {
                                  throw new Error(`Failed to check ORCID: ${await checkResponse.text()}`)
                                }
                              } catch (error: any) {
                                console.error("Failed to save researcher:", error)
                                toast({
                                  title: "Save Failed",
                                  description: error.message || "Failed to save researcher to database",
                                  variant: "destructive",
                                })
                              }
                            }}
                            title="Save to Researchers Database"
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    {/* Dynamic columns - show data from selected columns */}
                    {columns.filter(c => c.selected).map((column) => (
                      <TableCell key={column.name}>
                        {String(row[column.name] || 'N/A')}
                      </TableCell>
                    ))}
                    <TableCell>
                      {row.orcid_id ? (
                        <div className="flex items-center space-x-2">
                          <a 
                            href={`https://orcid.org/${row.orcid_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {row.orcid_id}
                          </a>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setSelectedOrcidId(row.orcid_id)
                              setSelectedResearcherName(`${row.first_name || row.prenom || ''} ${row.last_name || row.nom || ''}`)
                              setOrcidProfileModalOpen(true)
                            }}
                            title="View ORCID Profile Details"
                          >
                            <Eye className="h-4 w-4" />
                            Details
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not found</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.orcid_status === "found"
                            ? "default"
                            : row.orcid_status === "pending"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {row.orcid_status || "Not searched"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.main_research_area ? (
                        <div className="max-w-xs">
                          {row.main_research_area.length > 50 ? (
                            <div>
                              <span className="text-sm">
                                {row.main_research_area.substring(0, 50)}...
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-auto p-0 ml-1 text-blue-600 hover:text-blue-800"
                                onClick={() => {
                                  const updatedRows = [...tableRows]
                                  updatedRows[index] = {
                                    ...row,
                                    showFullMainResearch: !row.showFullMainResearch
                                  }
                                  setTableRows(updatedRows)
                                }}
                              >
                                {row.showFullMainResearch ? 'show less' : `+${row.main_research_area.split(',').length - 3} more`}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-sm">{row.main_research_area}</span>
                          )}
                          {row.showFullMainResearch && (
                            <div className="mt-1 text-sm text-gray-600">
                              {row.main_research_area}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.specific_research_area ? (
                        <div className="max-w-xs">
                          {row.specific_research_area.length > 50 ? (
                            <div>
                              <span className="text-sm">
                                {row.specific_research_area.substring(0, 50)}...
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-auto p-0 ml-1 text-blue-600 hover:text-blue-800"
                                onClick={() => {
                                  const updatedRows = [...tableRows]
                                  updatedRows[index] = {
                                    ...row,
                                    showFullSpecificResearch: !row.showFullSpecificResearch
                                  }
                                  setTableRows(updatedRows)
                                }}
                              >
                                {row.showFullSpecificResearch ? 'show less' : `+${row.specific_research_area.split(',').length - 3} more`}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-sm">{row.specific_research_area}</span>
                          )}
                          {row.showFullSpecificResearch && (
                            <div className="mt-1 text-sm text-gray-600">
                              {row.specific_research_area}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
          
          {/* Show message if there are more rows */}
          {filteredTableRows.length > 20 && (
            <div className="mt-4 p-3 bg-muted rounded-lg text-center text-sm text-muted-foreground">
              Showing first 20 rows. Use the search box above to filter results.
            </div>
          )}
        </CardContent>
      </Card>
    )}


  </div>
  )
}

interface ProjectResearchProps {
  projectTitle: string
  updateProjectTitle: (value: string) => void
  projectDescription: string
  updateProjectDescription: (value: string) => void
  handleProjectResearch: () => void
  isLoading: boolean
  progress: number
  projectResearchers: ProjectResearcher[]
  setOrcidProfileModalOpen: (open: boolean) => void
  setSelectedOrcidId: (id: string) => void
  setSelectedResearcherName: (name: string) => void
  similarityServiceAvailable: boolean
  checkSimilarityService: () => void
}

const ProjectResearch = ({
  projectTitle,
  updateProjectTitle,
  projectDescription,
  updateProjectDescription,
  handleProjectResearch,
  isLoading,
  progress,
  projectResearchers,
  setOrcidProfileModalOpen,
  setSelectedOrcidId,
  setSelectedResearcherName,
  similarityServiceAvailable,
  checkSimilarityService
}: ProjectResearchProps) => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <FileText className="h-5 w-5" />
          <span>Project-based Researcher Retrieval</span>
        </CardTitle>
        <CardDescription>
          {similarityServiceAvailable 
            ? "Find researchers using advanced similarity matching based on research domains and keywords"
            : "Advanced similarity matching service not available. Using basic project research."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="project-title">Project Title</Label>
          <Input
            id="project-title"
            placeholder="Enter your project title"
            value={projectTitle}
            onChange={(e) => updateProjectTitle(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="project-description">Project Description</Label>
          <Textarea
            id="project-description"
            placeholder="Describe your project, research goals, and methodology..."
            rows={4}
            value={projectDescription}
            onChange={(e) => updateProjectDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-blue-900">
              {similarityServiceAvailable ? "RAG-Enhanced Search" : "Standard Search"}
            </h4>
              {/* <Button
                variant="ghost"
                size="sm"
                onClick={checkSimilarityService}
                className="h-6 px-2 text-blue-700 hover:text-blue-900"
              >
                <RefreshCw className="h-3 w-3" />
              </Button> */}
            </div>
            <p className="text-sm text-blue-700">
              {similarityServiceAvailable 
                ? "Uses semantic similarity and hybrid retrieval to match researchers with your project based on their research domains and specific keywords."
                : "Basic search functionality. For enhanced results, ensure the similarity service is running on port 8020."}
            </p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <h4 className="font-medium text-green-900 mb-2">Smart Ranking</h4>
            <p className="text-sm text-green-700">
              Results are ranked by {similarityServiceAvailable ? "similarity score with detailed domain/keyword matching" : "general relevance"}
            </p>
          </div>
        </div>

        <Button 
          className="w-full" 
          disabled={!projectTitle || !projectDescription || isLoading}
          onClick={handleProjectResearch}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Searching Researchers...
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              Find Relevant Researchers
            </>
          )}
        </Button>

        {isLoading && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-muted-foreground text-center">
              {similarityServiceAvailable 
                ? "Analyzing researcher profiles using semantic similarity..." 
                : "Searching researcher database..."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Project Results */}
    {projectResearchers.length > 0 && (
      <Card>
        <CardHeader>
          <CardTitle>Relevant Researchers</CardTitle>
          <CardDescription>
            Researchers ranked by relevance to your project ({projectResearchers.length} found)
            {similarityServiceAvailable && " - Enhanced with similarity matching"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-4">
              {similarityServiceAvailable && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                  RAG-Enhanced Results
                </Badge>
              )}
            </div>
            {/* <div className="flex space-x-2"> */}
              {/* <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Export Results
              </Button> */}
            {/* </div> */}
          </div>

          <ScrollArea className="h-96">
            <div className="space-y-4">
              {projectResearchers.map((researcher) => (
                <Card key={researcher.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h4 className="font-semibold text-lg">{researcher.name}</h4>
                        {researcher.similarity_score && (
                          <Badge variant="outline" className="bg-green-50 text-green-700">
                            {(researcher.similarity_score * 100).toFixed(1)}% match
                          </Badge>
                        )}
                        {researcher.best_match_type && (
                          <Badge variant="secondary" className="text-xs">
                            Best match: {researcher.best_match_type}
                          </Badge>
                        )}
                      </div>
                      
                      <p className="text-muted-foreground mb-2">{decodeUnicode(researcher.affiliation)}</p>
                      
                      {/* Research Areas */}
                      <div className="mb-2">
                        <Label className="text-sm font-medium">Research Areas</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {researcher.researchAreas?.map((area, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {decodeUnicode(area)}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Keywords */}
                      <div className="mb-2">
                        <Label className="text-sm font-medium">Keywords</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {researcher.keywords?.map((keyword, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {decodeUnicode(keyword)}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Similarity Details */}
                      {/* {similarityServiceAvailable && researcher.similarity_score && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <Label className="text-sm font-medium">Matching Details</Label>
                          <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                            {researcher.domain_similarity !== undefined && (
                              <div>
                                <span className="text-muted-foreground">Domain Match: </span>
                                <span className="font-medium">{(researcher.domain_similarity * 100).toFixed(1)}%</span>
                              </div>
                            )}
                            {researcher.keywords_similarity !== undefined && (
                              <div>
                                <span className="text-muted-foreground">Keywords Match: </span>
                                <span className="font-medium">{(researcher.keywords_similarity * 100).toFixed(1)}%</span>
                              </div>
                            )}
                          </div>
                          {researcher.matched_content && (
                            <div className="mt-2">
                              <span className="text-xs text-muted-foreground">Matched Content: </span>
                              <span className="text-xs italic">{decodeUnicode(researcher.matched_content)}</span>
                            </div>
                          )}
                        </div>
                      )} */}
                    </div>
                    
                    <div className="flex flex-col space-y-2 ml-4">
                      {researcher.orcid && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedOrcidId(researcher.orcid!)
                            setSelectedResearcherName(researcher.name)
                            setOrcidProfileModalOpen(true)
                          }}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View ORCID
                        </Button>
                      )}
                      <div className="text-right">
                        <div className="text-2xl font-bold text-green-600">
                          {researcher.similarity_score 
                            ? Math.round(researcher.similarity_score * 100)
                            : Math.round(researcher.relevanceScore * 100)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {researcher.similarity_score ? "Similarity" : "Relevance"}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    )}
  </div>
)

// ORCID Profile Modal Component
interface ORCIDProfileModalProps {
  isOpen: boolean
  onClose: () => void
  orcidId: string
  researcherName: string
}

const ORCIDProfileModal = ({ isOpen, onClose, orcidId, researcherName }: ORCIDProfileModalProps) => {
  const [profileData, setProfileData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>("")

  useEffect(() => {
    if (isOpen && orcidId) {
      loadProfile()
    }
  }, [isOpen, orcidId])

  const loadProfile = async () => {
    try {
      setIsLoading(true)
      setError("")
      const response = await dataManagementService.getORCIDProfile(orcidId, true, 5)
      setProfileData(response)
    } catch (err: any) {
      console.error("Failed to load ORCID profile:", err)
      setError(err.message || "Failed to load profile")
    } finally {
      setIsLoading(false)
    }
  }

  // Fallback extraction functions for backwards compatibility
  const extractAffiliations = (text: string): string[] => {
    const affiliations: string[] = []
    const lines = text.split('\n')
    let inEmploymentSection = false
    let inEducationSection = false
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase()
      
      // Check for section headers
      if (lowerLine.includes('employment') || lowerLine.includes('affiliation') || lowerLine.includes('work')) {
        inEmploymentSection = true
        inEducationSection = false
        continue
      } else if (lowerLine.includes('education') || lowerLine.includes('qualification')) {
        inEducationSection = true
        inEmploymentSection = false
        continue
      } else if (lowerLine.includes('research') || lowerLine.includes('publication') || lowerLine.includes('work')) {
        inEmploymentSection = false
        inEducationSection = false
      }
      
      // Extract organization names
      if ((inEmploymentSection || inEducationSection) && line.trim()) {
        // Look for organization patterns
        const orgPatterns = [
          /organization[:\s]*([^,\n]+)/i,
          /institution[:\s]*([^,\n]+)/i,
          /university[:\s]*([^,\n]+)/i,
          /company[:\s]*([^,\n]+)/i,
          /department[:\s]*([^,\n]+)/i,
          /"([^"]*(?:university|institute|college|laboratory|company|corporation)[^"]*)"/i,
          /'([^']*(?:university|institute|college|laboratory|company|corporation)[^']*)'/i
        ]
        
        for (const pattern of orgPatterns) {
          const match = line.match(pattern)
          if (match && match[1]) {
            const org = match[1].trim()
            if (org.length > 3 && !affiliations.includes(org)) {
              affiliations.push(org)
            }
          }
        }
      }
    }
    
    return affiliations.length > 0 ? affiliations : ['No affiliations found in profile']
  }

  const extractResearchFields = (text: string): string[] => {
    const fields: string[] = []
    const lines = text.split('\n')
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase()
      
      // Look for research field indicators
      if (lowerLine.includes('research') || lowerLine.includes('field') || lowerLine.includes('area') ||
          lowerLine.includes('discipline') || lowerLine.includes('subject') || lowerLine.includes('domain')) {
        
        // Extract potential research fields
        const fieldPatterns = [
          /research[:\s]*([^,\n\.]+)/i,
          /field[:\s]*([^,\n\.]+)/i,
          /area[:\s]*([^,\n\.]+)/i,
          /discipline[:\s]*([^,\n\.]+)/i,
          /expertise[:\s]*([^,\n\.]+)/i,
          /"([^"]*(?:science|engineering|technology|research|studies|analysis)[^"]*)"/i
        ]
        
        for (const pattern of fieldPatterns) {
          const match = line.match(pattern)
          if (match && match[1]) {
            const field = match[1].trim()
            if (field.length > 5 && !fields.includes(field)) {
              fields.push(field)
            }
          }
        }
      }
    }
    
    return fields.length > 0 ? fields : ['Research fields not specified in profile']
  }

  const extractKeywords = (text: string): string[] => {
    const keywords: string[] = []
    const lines = text.split('\n')
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase()
      
      // Look for keywords, titles, and technical terms
      if (lowerLine.includes('title') || lowerLine.includes('keyword') || lowerLine.includes('subject') ||
          lowerLine.includes('work') || lowerLine.includes('publication')) {
        
        // Extract technical keywords and terms
        const keywordPatterns = [
          /title[:\s]*([^,\n\.]+)/i,
          /keyword[:\s]*([^,\n\.]+)/i,
          /subject[:\s]*([^,\n\.]+)/i,
          /"([^"]*(?:algorithm|model|system|method|analysis|optimization|detection|classification)[^"]*)"/i,
          /\b(artificial intelligence|machine learning|deep learning|neural network|computer vision|natural language processing|data mining|big data|cloud computing|blockchain|cybersecurity|software engineering|web development|mobile development|database|network|algorithm|optimization|simulation|modeling|analysis|research|development|innovation|technology|science|engineering|mathematics|statistics|physics|chemistry|biology|medicine|healthcare|finance|economics|business|management|education|psychology|sociology|linguistics|philosophy|law|politics|environmental|energy|sustainability|climate|agriculture|food|nutrition|sports|music|art|design|architecture|construction|manufacturing|automotive|aerospace|robotics|automation|internet of things|iot|virtual reality|augmented reality|quantum computing|bioinformatics|genomics|proteomics|nanotechnology|materials science|renewable energy|smart cities|fintech|edtech|healthtech|biotech|cleantech)\b/gi
        ]
        
        for (const pattern of keywordPatterns) {
          const matches = line.match(pattern)
          if (matches) {
            matches.forEach(match => {
              if (match && match.length > 3) {
                const keyword = match.trim().toLowerCase()
                if (!keywords.includes(keyword)) {
                  keywords.push(keyword)
                }
              }
            })
          }
        }
      }
    }
    
    return keywords.length > 0 ? keywords.slice(0, 15) : ['No specific keywords identified']
  }

  const renderProfileContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading ORCID profile...</span>
        </div>
      )
    }

    if (error) {
      return (
        <div className="text-center py-8">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600">{error}</p>
          <Button onClick={loadProfile} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      )
    }

    if (!profileData) {
      return <div className="py-8 text-center text-muted-foreground">No profile data available</div>
    }

    // Use structured data if available, otherwise fall back to text parsing
    const structuredData: ORCIDStructuredData | undefined = profileData.structured_data
    let affiliations: string[] = []
    let researchFields: string[] = []
    let keywords: string[] = []

    if (structuredData) {
      // Use the structured data from the API
      affiliations = structuredData.affiliations || []
      researchFields = structuredData.research_fields || []
      keywords = structuredData.keywords || []
    } else {
      // Fallback to text parsing for backwards compatibility
      let profileText = ""
      try {
        if (typeof profileData.profile === 'string') {
          profileText = profileData.profile
        } else {
          profileText = JSON.stringify(profileData.profile, null, 2)
        }
      } catch {
        profileText = "Unable to parse profile data"
      }

      affiliations = extractAffiliations(profileText)
      researchFields = extractResearchFields(profileText)
      keywords = extractKeywords(profileText)
    }

    return (
      <div className="space-y-6">
        {/* Header with basic info */}
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center space-x-4">
            <div className="bg-blue-100 rounded-full p-3">
              <User className="h-8 w-8 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold">{researcherName}</h3>
              <p className="text-blue-600">ORCID ID: {orcidId}</p>
              
              {/* External Links */}
              <div className="flex flex-wrap gap-4 mt-2">
                <a 
                  href={`https://orcid.org/${orcidId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-500 hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  View on ORCID.org
                </a>
                
                {structuredData?.scopus_url && (
                  <a 
                    href={structuredData.scopus_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-orange-500 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Scopus Profile
                  </a>
                )}
                
                {structuredData?.linkedin_url && (
                  <a 
                    href={structuredData.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-700 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View LinkedIn
                  </a>
                )}
                
                {structuredData?.google_scholar && (
                  <a 
                    href={structuredData.google_scholar}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-green-600 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Google Scholar
                  </a>
                )}
                
                {structuredData?.researchgate && (
                  <a 
                    href={structuredData.researchgate}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-teal-600 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View ResearchGate
                  </a>
                )}
                
                {structuredData?.personal_website && (
                  <a 
                    href={structuredData.personal_website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-purple-600 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Personal Website
                  </a>
                )}
              </div>
              
              {structuredData?.total_works && (
                <p className="text-sm text-blue-600 mt-2">
                  {structuredData.total_works} research works found
                </p>
              )}
              
              {/* External Identifiers Summary */}
              {structuredData?.external_identifiers && structuredData.external_identifiers.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-600">
                    External IDs: {structuredData.external_identifiers.map(id => id.type).join(", ")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Affiliations and Employment */}
          <div className="bg-white border rounded-lg p-4">
            <h4 className="font-semibold mb-3 flex items-center text-green-700">
              <Building2 className="h-5 w-5 mr-2" />
              Affiliations & Employment
            </h4>
            <div className="space-y-2">
              {affiliations.map((affiliation, index) => (
                <div key={index} className="bg-green-50 p-3 rounded-md border-l-4 border-green-200">
                  <p className="text-sm font-medium text-green-800">{affiliation}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: Main Fields of Research */}
          <div className="bg-white border rounded-lg p-4">
            <h4 className="font-semibold mb-3 flex items-center text-purple-700">
              <BookOpen className="h-5 w-5 mr-2" />
              Main Research Fields
            </h4>
            <div className="space-y-2">
              {researchFields.map((field, index) => (
                <div key={index} className="bg-purple-50 p-3 rounded-md border-l-4 border-purple-200">
                  <p className="text-sm font-medium text-purple-800">{field}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Column 3: Specific Keywords */}
          <div className="bg-white border rounded-lg p-4">
            <h4 className="font-semibold mb-3 flex items-center text-orange-700">
              <Tag className="h-5 w-5 mr-2" />
              Research Keywords
            </h4>
            <div className="space-y-1">
              {keywords.map((keyword, index) => (
                <span 
                  key={index} 
                  className="inline-block bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full mr-1 mb-1"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* External Identifiers and Links */}
        {(structuredData?.external_identifiers && structuredData.external_identifiers.length > 0) || 
         (structuredData?.researcher_urls && structuredData.researcher_urls.length > 0) ||
         structuredData?.scopus_url || structuredData?.linkedin_url || structuredData?.google_scholar ||
         structuredData?.researchgate || structuredData?.researcherid_url || structuredData?.publons_url ? (
          <div className="bg-white border rounded-lg p-4">
            <h4 className="font-semibold mb-3 flex items-center text-cyan-700">
              <ExternalLink className="h-5 w-5 mr-2" />
              External Profiles & Identifiers
            </h4>
            
            {/* Quick Links for Major Platforms */}
            {(structuredData?.scopus_url || structuredData?.linkedin_url || structuredData?.google_scholar ||
              structuredData?.researchgate || structuredData?.researcherid_url || structuredData?.publons_url) && (
              <div className="mb-4">
                <h5 className="font-medium text-sm text-gray-700 mb-2">Quick Links</h5>
                <div className="flex flex-wrap gap-2">
                  {structuredData?.scopus_url && (
                    <a 
                      href={structuredData.scopus_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-xs font-medium hover:bg-orange-200 transition-colors flex items-center gap-1"
                    >
                      Scopus ({structuredData.scopus_id}) <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {structuredData?.researcherid_url && (
                    <a 
                      href={structuredData.researcherid_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium hover:bg-blue-200 transition-colors flex items-center gap-1"
                    >
                      ResearcherID ({structuredData.researcherid}) <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {structuredData?.linkedin_url && (
                    <a 
                      href={structuredData.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium hover:bg-blue-200 transition-colors flex items-center gap-1"
                    >
                      LinkedIn <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {structuredData?.google_scholar && (
                    <a 
                      href={structuredData.google_scholar}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-medium hover:bg-red-200 transition-colors flex items-center gap-1"
                    >
                      Google Scholar <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {structuredData?.researchgate && (
                    <a 
                      href={structuredData.researchgate}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-medium hover:bg-green-200 transition-colors flex items-center gap-1"
                    >
                      ResearchGate <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {structuredData?.publons_url && (
                    <a 
                      href={structuredData.publons_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-xs font-medium hover:bg-purple-200 transition-colors flex items-center gap-1"
                    >
                      Publons <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {structuredData?.personal_website && (
                    <a 
                      href={structuredData.personal_website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-xs font-medium hover:bg-gray-200 transition-colors flex items-center gap-1"
                    >
                      Personal Website <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* External Identifiers */}
              {structuredData?.external_identifiers && structuredData.external_identifiers.length > 0 && (
                <div>
                  <h5 className="font-medium text-sm text-gray-700 mb-2">External Identifiers</h5>
                  <div className="space-y-2">
                    {structuredData.external_identifiers.map((identifier, index) => (
                      <div key={index} className="bg-cyan-50 p-3 rounded-md border-l-4 border-cyan-200">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-cyan-800">{identifier.type}</p>
                            <p className="text-xs text-cyan-600">{identifier.value}</p>
                            {identifier.source && (
                              <p className="text-xs text-gray-500 mt-1">Source: {identifier.source}</p>
                            )}
                          </div>
                          {identifier.url && (
                            <a 
                              href={identifier.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-cyan-600 hover:text-cyan-800 ml-2 flex-shrink-0"
                              title={`View ${identifier.type} profile`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Researcher URLs */}
              {structuredData?.researcher_urls && structuredData.researcher_urls.length > 0 && (
                <div>
                  <h5 className="font-medium text-sm text-gray-700 mb-2">Researcher URLs</h5>
                  <div className="space-y-2">
                    {structuredData.researcher_urls.map((urlItem, index) => (
                      <div key={index} className="bg-cyan-50 p-3 rounded-md border-l-4 border-cyan-200">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-cyan-800">{urlItem.name}</p>
                            <p className="text-xs text-cyan-600 break-all">{urlItem.url}</p>
                          </div>
                          <a 
                            href={urlItem.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-600 hover:text-cyan-800 ml-2 flex-shrink-0"
                            title={`Visit ${urlItem.name}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Academic Websites */}
            {structuredData?.academic_websites && structuredData.academic_websites.length > 0 && (
              <div className="mt-4">
                <h5 className="font-medium text-sm text-gray-700 mb-2">Academic Websites</h5>
                <div className="space-y-2">
                  {structuredData.academic_websites.map((website, index) => (
                    <div key={index} className="bg-indigo-50 p-3 rounded-md border-l-4 border-indigo-200">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-indigo-800">{website.name}</p>
                          <p className="text-xs text-indigo-600 break-all">{website.url}</p>
                        </div>
                        <a 
                          href={website.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 ml-2 flex-shrink-0"
                          title={`Visit ${website.name}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Email Addresses */}
            {structuredData?.emails && structuredData.emails.length > 0 && (
              <div className="mt-4">
                <h5 className="font-medium text-sm text-gray-700 mb-2">Email Addresses</h5>
                <div className="space-y-2">
                  {structuredData.emails.map((email, index) => (
                    <div key={index} className="bg-green-50 p-3 rounded-md border-l-4 border-green-200">
                      <div className="flex justify-between items-center">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-green-800">{email.email}</p>
                          <div className="flex gap-2 mt-1">
                            {email.verified && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Verified</span>
                            )}
                            {email.primary && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Primary</span>
                            )}
                          </div>
                        </div>
                        <a 
                          href={`mailto:${email.email}`}
                          className="text-green-600 hover:text-green-800 ml-2 flex-shrink-0"
                          title={`Send email to ${email.email}`}
                        >
                          <Mail className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Recent Works */}
        {structuredData?.work_titles && structuredData.work_titles.length > 0 && (
          <div className="bg-white border rounded-lg p-4">
            <h4 className="font-semibold mb-3 flex items-center text-indigo-700">
              <FileText className="h-5 w-5 mr-2" />
              Recent Research Works
            </h4>
            <div className="space-y-2">
              {structuredData.work_titles.map((title: string, index: number) => (
                <div key={index} className="bg-indigo-50 p-3 rounded-md border-l-4 border-indigo-200">
                  <p className="text-sm font-medium text-indigo-800">{title}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Raw Profile Data (Collapsible) */}
        <div className="bg-white border rounded-lg">
          <details className="group">
            <summary className="cursor-pointer p-4 font-semibold flex items-center hover:bg-gray-50 rounded-lg">
              <FileText className="h-5 w-5 mr-2" />
              Raw Profile Data
              <ChevronDown className="h-4 w-4 ml-auto group-open:rotate-180 transition-transform" />
            </summary>
            <div className="px-4 pb-4">
              <div className="bg-gray-50 p-3 rounded text-xs">
                <pre className="whitespace-pre-wrap overflow-auto max-h-60">
                  {JSON.stringify(profileData, null, 2)}
                </pre>
              </div>
            </div>
          </details>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center space-x-2">
            <Search className="h-5 w-5" />
            <span>ORCID Profile Details</span>
          </DialogTitle>
          <DialogDescription>
            Detailed profile information from ORCID database
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 min-h-0 overflow-y-auto px-4">
          {renderProfileContent()}
        </div>
        
        {/* Action buttons - Fixed at bottom */}
        <div className="flex justify-between pt-4 border-t flex-shrink-0">
          <Button variant="outline" onClick={loadProfile}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// API Keys Modal Component
interface ApiKeysModalProps {
  isOpen: boolean
  onClose: () => void
  apiKeys: ApiKeys | null
}

const ApiKeysModal = ({ isOpen, onClose, apiKeys }: ApiKeysModalProps) => {
  const maskApiKey = (key: string | undefined): string => {
    if (!key) return 'Not set'
    if (key.length <= 6) return '*'.repeat(key.length)
    return key.substring(0, 3) + '•••••' + key.substring(key.length - 3)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Key className="h-5 w-5" />
            <span>Saved API Keys</span>
          </DialogTitle>
          <DialogDescription>
            View and manage your saved API keys. Keys are stored securely in the database.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {!apiKeys ? (
            <div className="text-center py-8">
              <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
              <p className="text-muted-foreground">No API keys found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* OpenAI */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-blue-600">OpenAI API Key</h4>
                    <p className="text-sm text-muted-foreground">Used for GPT models</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <code className="text-sm bg-muted px-2 py-1 rounded">
                      {maskApiKey(apiKeys.cle_openai)}
                    </code>
                  </div>
                </div>
              </div>

              {/* Gemini */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-purple-600">Google Gemini API Key</h4>
                    <p className="text-sm text-muted-foreground">Used for Gemini models</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <code className="text-sm bg-muted px-2 py-1 rounded">
                      {maskApiKey(apiKeys.cle_gemini)}
                    </code>
                  </div>
                </div>
              </div>

              {/* DeepSeek */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-green-600">DeepSeek API Key</h4>
                    <p className="text-sm text-muted-foreground">Used for DeepSeek models</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <code className="text-sm bg-muted px-2 py-1 rounded">
                      {maskApiKey(apiKeys.cle_deepseek)}
                    </code>
                  </div>
                </div>
              </div>

              {/* Claude */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-orange-600">Claude API Key</h4>
                    <p className="text-sm text-muted-foreground">Used for Claude models</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <code className="text-sm bg-muted px-2 py-1 rounded">
                      {maskApiKey(apiKeys.cle_claude)}
                    </code>
                  </div>
                </div>
              </div>

              {/* Scopus */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-red-600">Scopus API Key</h4>
                    <p className="text-sm text-muted-foreground">Used for Scopus research data</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <code className="text-sm bg-muted px-2 py-1 rounded">
                      {maskApiKey(apiKeys.cle_scopus)}
                    </code>
                  </div>
                </div>
              </div>


            </div>
          )}
        </div>
        
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Schema Modal Component
interface SchemaModalProps {
  isOpen: boolean
  onClose: () => void
  schemaData: any
  databaseName: string
}

const SchemaModal = ({ isOpen, onClose, schemaData, databaseName }: SchemaModalProps) => {
  const renderSchemaContent = () => {
    if (!schemaData) {
      return <p className="text-muted-foreground">No schema data available</p>
    }

    // Handle different schema formats
    if (typeof schemaData === 'string') {
      try {
        const parsedSchema = JSON.parse(schemaData)
        return renderParsedSchema(parsedSchema)
      } catch {
        return (
          <div className="space-y-2">
            <h4 className="font-medium">Raw Schema:</h4>
            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">
              {schemaData}
            </pre>
          </div>
        )
      }
    } else if (typeof schemaData === 'object') {
      return renderParsedSchema(schemaData)
    }

    return <p className="text-muted-foreground">Unable to parse schema data</p>
  }

  const renderParsedSchema = (schema: any) => {
    // Check for metadata
    const metadata = schema._metadata
    const hasMetadata = metadata && typeof metadata === 'object'
    const schemaWithoutMetadata = hasMetadata ? { ...schema } : schema
    if (hasMetadata) {
      delete schemaWithoutMetadata._metadata
    }

    return (
      <div className="space-y-4">
        {/* Show metadata if available */}
        {hasMetadata && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h4 className="font-medium text-blue-900 mb-2 flex items-center space-x-2">
              <Database className="h-4 w-4" />
              <span>Schema Information</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-blue-800">
              {metadata.requested_schema && (
                <div>
                  <span className="font-medium">Schema:</span> {metadata.requested_schema}
                </div>
              )}
              {metadata.table_count && (
                <div>
                  <span className="font-medium">Tables:</span> {metadata.table_count}
                </div>
              )}
              {metadata.available_schemas && (
                <div className="md:col-span-3">
                  <span className="font-medium">Available Schemas:</span> {metadata.available_schemas}
                </div>
              )}
            </div>
          </div>
        )}

        {Array.isArray(schemaWithoutMetadata) ? (
          <div className="space-y-4">
            {schemaWithoutMetadata.map((table: any, index: number) => (
              <div key={index} className="border rounded-lg p-4">
                <h4 className="font-medium mb-2 flex items-center space-x-2">
                  <Database className="h-4 w-4" />
                  <span>{table.table_name || table.name || `Table ${index + 1}`}</span>
                </h4>
                {table.columns && (
                  <div className="space-y-2">
                    {table.columns.map((column: any, colIndex: number) => (
                      <div key={colIndex} className="flex justify-between items-center text-sm p-2 bg-muted rounded">
                        <span className="font-medium">{column.name || column.column_name}</span>
                        <Badge variant="outline">{column.type || column.data_type || 'unknown'}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : typeof schemaWithoutMetadata === 'object' ? (
          <div className="space-y-4">
            {Object.entries(schemaWithoutMetadata).map(([tableName, tableData]: [string, any]) => (
              <div key={tableName} className="border rounded-lg p-4">
                <h4 className="font-medium mb-3 flex items-center space-x-2">
                  <Database className="h-4 w-4" />
                  <span>{tableName}</span>
                  <Badge variant="secondary" className="text-xs">
                    {typeof tableData === 'object' && tableData !== null 
                      ? `${Object.keys(tableData).length} columns` 
                      : '0 columns'
                    }
                  </Badge>
                </h4>
                <div className="space-y-2">
                  {typeof tableData === 'object' && tableData !== null ? (
                    Object.entries(tableData).map(([columnName, columnType]: [string, any]) => {
                      const typeString = String(columnType)
                      const hasConstraints = typeString.includes('[') || typeString.includes('NOT NULL') || typeString.includes('DEFAULT')
                      
                      return (
                        <div key={columnName} className="flex justify-between items-start text-sm p-3 bg-muted rounded">
                          <div className="flex-1">
                            <span className="font-medium text-foreground">{columnName}</span>
                            {hasConstraints && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {typeString.includes('[PRIMARY KEY]') && (
                                  <Badge variant="default" className="text-xs">PK</Badge>
                                )}
                                {typeString.includes('[FOREIGN KEY]') && (
                                  <Badge variant="outline" className="text-xs">FK</Badge>
                                )}
                                {typeString.includes('[UNIQUE KEY]') && (
                                  <Badge variant="outline" className="text-xs">UNIQUE</Badge>
                                )}
                                {typeString.includes('NOT NULL') && (
                                  <Badge variant="secondary" className="text-xs">NOT NULL</Badge>
                                )}
                                {typeString.includes('DEFAULT') && (
                                  <Badge variant="outline" className="text-xs">DEFAULT</Badge>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="ml-4 text-right">
                            <Badge variant="outline" className="font-mono text-xs">
                              {typeString.split(' ')[0]} {/* Show just the base type */}
                            </Badge>
                            {typeString.length > 50 && (
                              <p className="text-xs text-muted-foreground mt-1 max-w-xs break-words">
                                {typeString}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No column information available</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">Unable to render schema structure</p>
        )}
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Database className="h-5 w-5" />
            <span>Database Schema: {databaseName}</span>
          </DialogTitle>
          <DialogDescription>
            Tables, columns, and data types for this database connection
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[500px] pr-4">
          {renderSchemaContent()}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export default function DataManagementPage() {

  // State management
  const [activeTab, setActiveTab] = useState("table-orcid-search")
  const [apiKeys, setApiKeys] = useState({
    openai: "",
    gemini: "",
    deepseek: "",
  })
  const [selectedModel, setSelectedModel] = useState("o4-mini")
  const [databases, setDatabases] = useState<DatabaseConnection[]>([])
  const [selectedDatabase, setSelectedDatabase] = useState<string>("")
  const [tables, setTables] = useState<string[]>([])
  const [selectedTable, setSelectedTable] = useState<string>("")
  const [columns, setColumns] = useState<TableColumn[]>([])
  const [researcherRows, setResearcherRows] = useState<ResearcherRow[]>([])
  const [projectTitle, setProjectTitle] = useState("")
  const [projectDescription, setProjectDescription] = useState("")
  const [projectResearchers, setProjectResearchers] = useState<ProjectResearcher[]>([])
  const [projectKeywords, setProjectKeywords] = useState<string[]>([])
  const [projectAreas, setProjectAreas] = useState<string[]>([])
  const [similarityServiceAvailable, setSimilarityServiceAvailable] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressDetails, setProgressDetails] = useState<{
    current: number
    total: number
    status: string
    current_researcher?: string
    substatus?: string
  } | null>(null)
  const [currentTasks, setCurrentTasks] = useState<TaskStatus[]>([])
  const [newDbConnection, setNewDbConnection] = useState<Partial<DatabaseConnection>>({
    type: "postgres",
  })
  const [schemaModalOpen, setSchemaModalOpen] = useState(false)
  const [schemaData, setSchemaData] = useState<any>(null)
  const [selectedSchemaDatabase, setSelectedSchemaDatabase] = useState<string>("")
  const [schemaName, setSchemaName] = useState<string>("public")
  
  // ORCID Profile Modal state
  const [orcidProfileModalOpen, setOrcidProfileModalOpen] = useState(false)
  const [selectedOrcidId, setSelectedOrcidId] = useState<string>("")
  const [selectedResearcherName, setSelectedResearcherName] = useState<string>("")

  // API Keys Modal state
  const [viewApiKeysModalOpen, setViewApiKeysModalOpen] = useState(false)
  const [savedApiKeys, setSavedApiKeys] = useState<ApiKeys | null>(null)

  // Persistent ORCID Results state
  const [orcidResultsOpen, setOrcidResultsOpen] = useState(false)
  const [persistedResearcherRows, setPersistedResearcherRows] = useState<ResearcherRow[]>([])
  const [persistedTableName, setPersistedTableName] = useState("")
  const [persistedColumns, setPersistedColumns] = useState<TableColumn[]>([])

  // Filter state for ORCID results
  const [filterText, setFilterText] = useState("")

  // State for expanding research fields and keywords
  const [expandedFields, setExpandedFields] = useState<Record<string, boolean>>({})
  const [expandedKeywords, setExpandedKeywords] = useState<Record<string, boolean>>({})
  
  // State for Researcher Matching table rows
  const [tableRows, setTableRows] = useState<any[]>([])
  const tableRowsRef = useRef<any[]>([])
  
  // Keep ref in sync with state
  useEffect(() => {
    tableRowsRef.current = tableRows
  }, [tableRows])

  // Load databases on component mount
  useEffect(() => {
    loadDatabases()
    checkSimilarityService()
    loadSavedApiKeys()
  }, [])

  // Load saved API keys
  const loadSavedApiKeys = async () => {
    try {
      const keys = await apiKeyService.getApiKeys(1)
      setSavedApiKeys(keys)
      
      // If there are saved keys, update the local state
      if (keys.cle_openai || keys.cle_gemini || keys.cle_deepseek) {
        updateApiKey('openai', keys.cle_openai || '')
        updateApiKey('gemini', keys.cle_gemini || '')
        updateApiKey('deepseek', keys.cle_deepseek || '')
      }
    } catch (error) {
      console.error('Failed to load saved API keys:', error)
    }
  }

  // Check if similarity service is available
  const checkSimilarityService = useCallback(async () => {
    try {
      const isAvailable = await similarityService.isAvailable()
      setSimilarityServiceAvailable(isAvailable)
    } catch (error) {
      console.error('❌ Similarity service check failed:', error)
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      })
      setSimilarityServiceAvailable(false)
    }
  }, [])

  // Clear tables and columns when selected database changes
  useEffect(() => {
    setTables([])
    setSelectedTable("")
    setColumns([])
  }, [selectedDatabase])

  // Stable callback for updating database connection form
  const updateDbConnection = useCallback((field: string, value: any) => {
    setNewDbConnection(prev => ({ ...prev, [field]: value }))
  }, [])

  // Individual stable callbacks for each database field
  const updateDbName = useCallback((value: string) => {
    setNewDbConnection(prev => ({ ...prev, name: value }))
  }, [])

  const updateDbHost = useCallback((value: string) => {
    setNewDbConnection(prev => ({ ...prev, host: value }))
  }, [])

  const updateDbPort = useCallback((value: string) => {
    const portNum = value ? parseInt(value) : 0
    setNewDbConnection(prev => ({ ...prev, port: portNum }))
  }, [])

  const updateDbUsername = useCallback((value: string) => {
    setNewDbConnection(prev => ({ ...prev, username: value }))
  }, [])

  const updateDbPassword = useCallback((value: string) => {
    setNewDbConnection(prev => ({ ...prev, password: value }))
  }, [])

  const updateDbDatabase = useCallback((value: string) => {
    setNewDbConnection(prev => ({ ...prev, database: value }))
  }, [])

  const updateDbType = useCallback((value: string) => {
    setNewDbConnection(prev => ({ ...prev, type: value as any }))
  }, [])

  // Stable callbacks for API keys
  const updateApiKey = useCallback((provider: string, value: string) => {
    setApiKeys(prev => ({ ...prev, [provider]: value }))
  }, [])

  // Stable callbacks for project inputs
  const updateProjectTitle = useCallback((value: string) => {
    setProjectTitle(value)
  }, [])

  const updateProjectDescription = useCallback((value: string) => {
    setProjectDescription(value)
  }, [])

  const getCurrentLLMConfig = (): LLMConfig | undefined => {
    const selectedModelInfo = aiModels.find(m => m.value === selectedModel)
    if (!selectedModelInfo) return undefined

    const apiKey = apiKeys[selectedModelInfo.provider as keyof typeof apiKeys]
    if (!apiKey) return undefined

    return {
      model_name: selectedModel,
      api_key: apiKey,
      provider: "litellm"
    }
  }

  // Map DatabaseConfig to DatabaseConnection for compatibility with new YAML-based MCP server
  const mapDatabaseConfigToConnection = (config: DatabaseConfig): DatabaseConnection => ({
    id: config.id.toString(), // Use the numeric ID from MCP server
    name: config.conn_name, // Use connection name for display
    type: config.type as any,
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.pw,
    database: config.dbName, // Use database name for actual connection
    status: config.status === "connected" ? "connected" : "disconnected",
    created_at: config.created_at,
    last_tested: undefined
  })

  const loadDatabases = async () => {
    try {
      const configs = await getDatabases()
      const connections = configs.map(mapDatabaseConfigToConnection)
      console.log("connections", connections)
      setDatabases(connections)
    } catch (error) {
      console.error("Failed to load databases:", error)
      toast({
        title: "Error",
        description: "Failed to load database connections",
        variant: "destructive",
      })
    }
  }

  const handleAddDatabase = async () => {
    try {
      if (!newDbConnection.name || !newDbConnection.host || !newDbConnection.port || 
          !newDbConnection.database || !newDbConnection.username || !newDbConnection.password) {
        toast({
          title: "Error",
          description: "Please fill in all required fields",
          variant: "destructive",
        })
        return
      }

      setIsLoading(true)
      
      // Create database configuration for the new service
      const dbConfig: DatabaseConfigCreate = {
        id_user: 1, // Default user ID
        conn_name: newDbConnection.name!, // Use connection name
        dbName: newDbConnection.database!,
        type: newDbConnection.type === "postgres" ? "postgres" : "mysql", // Only supports postgres and mysql
        host: newDbConnection.host!,
        port: newDbConnection.port!,
        username: newDbConnection.username!,
        pw: newDbConnection.password!
      }

      const response = await createDatabase(dbConfig)
      
      toast({
        title: "Success",
        description: "Database connection added successfully",
      })

      // Reset form and reload databases
      setNewDbConnection({ type: "postgres" })
      await loadDatabases()
    } catch (error: any) {
      console.error("Failed to add database:", error)
      toast({
        title: "Error",
        description: error.response?.data?.detail || error.message || "Failed to add database connection",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleTestConnection = async (connectionId: string) => {
    try {
      setIsLoading(true)
      const dbId = parseInt(connectionId)
      const response = await testDatabaseConnection(dbId)
      
      if (response.status === "connected") {
        toast({
          title: "Success",
          description: "Database connection test successful",
        })
      } else {
        toast({
          title: "Connection Failed",
          description: response.message || "Failed to connect to database",
          variant: "destructive",
        })
      }

      await loadDatabases()
    } catch (error: any) {
      console.error("Failed to test connection:", error)
      toast({
        title: "Error",
        description: error.response?.data?.detail || error.message || "Failed to test database connection",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteDatabase = async (connectionId: string) => {
    try {
      // Show confirmation dialog
      if (!window.confirm("Are you sure you want to delete this database connection? This action cannot be undone.")) {
        return
      }

      setIsLoading(true)
      const dbId = parseInt(connectionId)
      const response = await deleteDatabase(dbId)
      
      toast({
        title: "Success",
        description: response.message || "Database connection deleted successfully",
      })

      await loadDatabases()
    } catch (error: any) {
      console.error("Failed to delete database:", error)
      toast({
        title: "Error",
        description: error.response?.data?.detail || error.message || "Failed to delete database connection",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleLoadSchema = async (connectionId: string) => {
    try {
      setIsLoading(true)
      const dbId = parseInt(connectionId)
      
      // Get database info to check type
      const db = databases.find(d => d.id === connectionId)
      const isPostgres = db?.type === 'postgres'
      
      // Use the data management service to get schema
      const response = await dataManagementService.getDatabaseSchema(dbId)
      console.log('Schema Response:', response)
      console.log('Schema Type:', typeof response.schema)
      console.log('Schema Keys:', response.schema && typeof response.schema === 'object' ? Object.keys(response.schema) : 'N/A')
      console.log('Database Type:', db?.type)
      console.log('Schema Name Used:', isPostgres ? schemaName : 'default')
      console.log('Full Schema Object:', JSON.stringify(response.schema, null, 2))
      
      // Extract table names from schema
      if (response.schema) {
        let tableNames: string[] = []
        
        // Handle different schema formats
        if (typeof response.schema === 'string') {
          try {
            const parsedSchema = JSON.parse(response.schema)
            if (typeof parsedSchema === 'object') {
              tableNames = Object.keys(parsedSchema).filter(key => key !== '_metadata')
            }
          } catch {
            // If it's not JSON, try to extract table names from text
            const lines = response.schema.split('\n')
            tableNames = lines
              .filter((line: string) => line.includes('Table:') || line.includes('table'))
              .map((line: string) => line.replace(/.*[Tt]able[:\s]+([^\s,]+).*/, '$1'))
              .filter((name: string) => name && name !== response.schema)
          }
        } else if (typeof response.schema === 'object') {
          if (Array.isArray(response.schema)) {
            tableNames = response.schema.map((table: any) => table.table_name || table.name || String(table))
          } else {
            tableNames = Object.keys(response.schema).filter(key => key !== '_metadata')
          }
        }
        
        setTables(tableNames)
        
        // Create columns from the first table if available
        if (tableNames.length > 0 && typeof response.schema === 'object' && !Array.isArray(response.schema)) {
          const firstTable = tableNames[0]
          const tableColumns = response.schema[firstTable]
          if (tableColumns && typeof tableColumns === 'object') {
            const columnList = Object.entries(tableColumns).map(([name, type]) => ({
              name,
              type: String(type),
              selected: false
            }))
            setColumns(columnList)
          }
        }
        
        // Store schema data for modal display
        setSchemaData(response.schema)
        setSelectedSchemaDatabase(databases.find(db => db.id === connectionId)?.name || `Database ${connectionId}`)
        setSchemaModalOpen(true)
        
        const toolUsed = response.tool_used || 'introspect_schema'
        const schemaUsed = response.schema_name || (isPostgres ? schemaName : 'default')
        
        toast({
          title: "Success",
          description: `Loaded ${tableNames.length} tables from ${schemaUsed} schema using ${toolUsed}`,
        })
      } else {
        toast({
          title: "Warning",
          description: "Schema loaded but no tables found",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      console.error("Failed to load schema:", error)
      toast({
        title: "Error",
        description: error.response?.data?.detail || error.message || "Failed to load database schema",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Handler for database selection that automatically loads schema
  const handleDatabaseSelection = useCallback(async (databaseId: string) => {
    setSelectedDatabase(databaseId)
    if (databaseId) {
      // Automatically load schema when database is selected
      try {
        await handleLoadSchema(databaseId)
      } catch (error) {
        console.error("Failed to auto-load schema:", error)
      }
    }
  }, [databases, schemaName])

  // Handler for table selection that loads columns for the selected table
  const handleTableSelection = useCallback((tableName: string) => {
    setSelectedTable(tableName)
    
    // Load columns for the selected table from the already loaded schema
    if (tableName && schemaData && typeof schemaData === 'object' && !Array.isArray(schemaData)) {
      const tableColumns = schemaData[tableName]
      if (tableColumns && typeof tableColumns === 'object') {
        const columnList = Object.entries(tableColumns).map(([name, type]) => ({
          name,
          type: String(type),
          selected: false
        }))
        setColumns(columnList)
      }
    } else {
      setColumns([])
    }
  }, [schemaData])

  // Function to extract research fields for researchers with ORCID IDs
  const extractResearchFieldsForAll = async () => {
    try {
      if (!selectedModel) {
        toast({
          title: "Error",
          description: "Please select an AI model first",
          variant: "destructive",
        })
        return
      }

      // Find researchers that have ORCID IDs but no research fields extracted
      const researchersNeedingExtraction = researcherRows.filter(r => 
        r.orcid && 
        r.orcidStatus === 'found' && 
        (!r.mainResearchFields || r.mainResearchFields.length === 0)
      )

      if (researchersNeedingExtraction.length === 0) {
        toast({
          title: "No Extraction Needed",
          description: "All researchers with ORCID IDs already have research fields extracted",
        })
        return
      }

      toast({
        title: "Extracting Research Fields",
        description: `Starting extraction for ${researchersNeedingExtraction.length} researchers...`,
      })

      // Process researchers in batches to avoid overwhelming the API
      const batchSize = 3
      for (let i = 0; i < researchersNeedingExtraction.length; i += batchSize) {
        const batch = researchersNeedingExtraction.slice(i, i + batchSize)
        
        await Promise.all(batch.map(async (researcher) => {
          try {
            // Update status to show extraction in progress
            setResearcherRows(prev => 
              prev.map(r => 
                r.id === researcher.id 
                  ? { ...r, extractionStatus: 'pending' as const }
                  : r
              )
            )

            const response = await fetch("http://localhost:8080/api/orcid/extract-research-fields", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orcid_id: researcher.orcid,
                model_name: selectedModel
              }),
            })

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${await response.text()}`)
            }

            const result = await response.json()

            if (result.success) {
              // Update researcher with extracted fields
              setResearcherRows(prev => 
                prev.map(r => 
                  r.id === researcher.id 
                    ? { 
                        ...r, 
                        mainResearchFields: result.main_research_fields || [],
                        researchKeywords: result.research_keywords || [],
                        extractionStatus: 'completed' as const
                      }
                    : r
                )
              )
            } else {
              throw new Error(result.error || "Extraction failed")
            }
          } catch (error: any) {
            console.error(`Failed to extract for ${researcher.prenom} ${researcher.nom}:`, error)
            setResearcherRows(prev => 
              prev.map(r => 
                r.id === researcher.id 
                  ? { ...r, extractionStatus: 'failed' as const }
                  : r
              )
            )
          }
        }))

        // Small delay between batches
        if (i + batchSize < researchersNeedingExtraction.length) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      toast({
        title: "Extraction Complete",
        description: `Research fields extracted for ${researchersNeedingExtraction.length} researchers`,
      })

    } catch (error: any) {
      console.error("Failed to extract research fields:", error)
      toast({
        title: "Extraction Failed",
        description: error.message || "Failed to extract research fields",
        variant: "destructive",
      })
    }
  }

  // Helper function to extract research fields for specific researchers (used for auto-extraction)
  const extractResearchFieldsForResearchers = async (researchers: ResearcherRow[], currentResults: ResearcherRow[]): Promise<ResearcherRow[]> => {
    try {
      if (!selectedModel) {
        console.error("No model selected for auto-extraction")
        return currentResults
      }

      // Filter to only researchers with ORCID IDs that need extraction
      const researchersNeedingExtraction = researchers.filter(r => 
        r.orcid && 
        r.orcidStatus === 'found' && 
        (!r.mainResearchFields || r.mainResearchFields.length === 0)
      )

      if (researchersNeedingExtraction.length === 0) {
        return currentResults
      }

      console.log(`Auto-extracting research fields for ${researchersNeedingExtraction.length} researchers`)

      // Create a copy of current results that we'll update
      let updatedResults = [...currentResults]

      // Process researchers in smaller batches for auto-extraction to be less intrusive
      const batchSize = 2
      for (let i = 0; i < researchersNeedingExtraction.length; i += batchSize) {
        const batch = researchersNeedingExtraction.slice(i, i + batchSize)
        
        await Promise.all(batch.map(async (researcher) => {
          try {
            const response = await fetch("http://localhost:8080/api/orcid/extract-research-fields", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orcid_id: researcher.orcid,
                model_name: selectedModel
              }),
            })

            if (response.ok) {
              const extractionResult = await response.json()
              
              // Update the researcher in our local results array
              updatedResults = updatedResults.map(r => 
                r.id === researcher.id ? {
                  ...r,
                  mainResearchFields: extractionResult.main_research_fields || extractionResult.mainResearchFields || [],
                  researchKeywords: extractionResult.research_keywords || extractionResult.researchKeywords || [],
                  extractionStatus: 'completed'
                } : r
              )
              
              console.log(`✅ Extracted fields for researcher ${researcher.id}:`, extractionResult)
            } else {
              console.error(`❌ Failed to extract fields for researcher ${researcher.id}`)
              
              // Mark as failed but don't break the process
              updatedResults = updatedResults.map(r => 
                r.id === researcher.id ? {
                  ...r,
                  extractionStatus: 'failed'
                } : r
              )
            }
          } catch (error) {
            console.error(`❌ Error extracting fields for researcher ${researcher.id}:`, error)
            
            // Mark as failed but continue
            updatedResults = updatedResults.map(r => 
              r.id === researcher.id ? {
                ...r,
                extractionStatus: 'failed'
              } : r
            )
          }
        }))

        // Longer delay between batches for auto-extraction to be less aggressive
        if (i + batchSize < researchersNeedingExtraction.length) {
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }

      return updatedResults

    } catch (error: any) {
      console.error("Auto-extraction failed:", error)
      return currentResults
    }
  }

  const handleORCIDSearch = async () => {
    try {
      const llmConfig = getCurrentLLMConfig()
      if (!llmConfig) {
        toast({
          title: "Error",
          description: "Please configure your AI model API key first",
          variant: "destructive",
        })
        return
      }

      if (!selectedDatabase || !selectedTable || columns.filter(c => c.selected).length === 0) {
        toast({
          title: "Error",
          description: "Please select database, table, and columns first",
          variant: "destructive",
        })
        return
      }

      setIsLoading(true)
      setProgress(0)
      setResearcherRows([]) // Clear previous results

      const selectedColumns = columns.filter(c => c.selected).map(c => c.name)
      
      // Call the new table ORCID search endpoint (synchronous)
      const searchResponse = await fetch("http://localhost:8080/api/orcid/table-search_v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          db_id: parseInt(selectedDatabase),
          table_name: selectedTable,
          selected_columns: selectedColumns,
          limit: 100,
          llm_config: llmConfig
        }),
      })

      if (!searchResponse.ok) {
        throw new Error(`HTTP ${searchResponse.status}: ${await searchResponse.text()}`)
      }

      const searchResults = await searchResponse.json()
      
      setProgress(100)
      
      // Check if we have any results
      if (!searchResults || searchResults.length === 0) {
        toast({
          title: "No Results",
          description: "No researchers were processed. Please check your database table and selected columns.",
          variant: "destructive",
        })
        return
      }
      
      // Process results and convert to ResearcherRow format  
      const processedResults: ResearcherRow[] = searchResults.map((researcher: any, index: number) => {
        // If no ORCID found, preserve original data from the database
        const hasOrcid = researcher.orcid_id && researcher.orcid_id.trim() !== ''
        const originalData = researcher.original_data || {}
        
        // Use original data for basic fields when no ORCID is found
        const nom = hasOrcid ? decodeUnicode(researcher.last_name || 'Unknown') : 
                   (originalData.nom || originalData.last_name || originalData.lastname || 'Unknown')
        const prenom = hasOrcid ? decodeUnicode(researcher.first_name || 'Unknown') : 
                       (originalData.prenom || originalData.first_name || originalData.firstname || 'Unknown')
        const affiliation = hasOrcid ? (researcher.affiliation || 'N/A') : 
                           (originalData.affiliation || originalData.institution || 'N/A')
        const email = hasOrcid ? researcher.email : 
                     (originalData.email || null)
        
        return {
          id: `researcher_${index + 1}`,
          nom: decodeUnicode(nom),
          prenom: decodeUnicode(prenom), 
          affiliation: affiliation,
          email: email,
          orcid: researcher.orcid_id || null,
          orcidStatus: hasOrcid ? 'found' : 'not_found',
          selected: false,
          notes: researcher.reasoning || '',
          // New fields from table-search_v2 endpoint
          first_name: decodeUnicode(researcher.first_name || prenom),
          last_name: decodeUnicode(researcher.last_name || nom),
          country: researcher.country,
          main_research_area: researcher.main_research_area,
          specific_research_area: researcher.specific_research_area,
          reasoning: researcher.reasoning,
          confidence: researcher.confidence || 0.0,
          // Convert research areas and keywords from comma-separated strings to arrays
          mainResearchFields: researcher.main_research_area ? researcher.main_research_area.split(',').map((field: string) => field.trim()) : [],
          researchKeywords: researcher.specific_research_area ? researcher.specific_research_area.split(',').map((keyword: string) => keyword.trim()) : [],
          extractionStatus: (researcher.main_research_area || researcher.specific_research_area) ? 'completed' : 
                           (hasOrcid ? 'pending' : undefined),
          originalData: originalData
        }
      })
      
      setResearcherRows(processedResults)
      
      // Also save to persistent state
      setPersistedResearcherRows(processedResults)
      setPersistedTableName(selectedTable)
      setPersistedColumns(columns.filter(c => c.selected))
      
      const orcidCount = processedResults.filter(r => r.orcid).length
      
      toast({
        title: "ORCID Search Completed",
        description: `Processed ${processedResults.length} researchers. Found ${orcidCount} ORCID matches.`,
      })

    } catch (error: any) {
      console.error("ORCID Search Error:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to perform ORCID search",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
      setProgress(0)
      setProgressDetails(null)
    }
  }

  const handleTableOrcidSearch = async () => {
    try {
      const llmConfig = getCurrentLLMConfig()
      if (!llmConfig) {
        toast({
          title: "Error",
          description: "Please configure your AI model API key first",
          variant: "destructive",
        })
        return
      }

      if (!selectedDatabase || !selectedTable || columns.filter(c => c.selected).length === 0) {
        toast({
          title: "Error",
          description: "Please select database, table, and columns first",
          variant: "destructive",
        })
        return
      }

      setIsLoading(true)
      setProgress(0)
      setResearcherRows([]) // Clear previous results

      const selectedColumns = columns.filter(c => c.selected).map(c => c.name)
      
      // Call the new DeepSeek table ORCID search endpoint
      const searchResponse = await fetch("http://localhost:8080/api/orcid/table-search-deepseek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          db_id: parseInt(selectedDatabase),
          table_name: selectedTable,
          selected_columns: selectedColumns,
          limit: 100,
          model_name: selectedModel
        }),
      })

      if (!searchResponse.ok) {
        throw new Error(`HTTP ${searchResponse.status}: ${await searchResponse.text()}`)
      }

      const searchResults = await searchResponse.json()
      
      setProgress(100)
      
      // Check if we have any results
      if (!searchResults || searchResults.length === 0) {
        toast({
          title: "No Results",
          description: "No researchers were processed. Please check your database table and selected columns.",
          variant: "destructive",
        })
        return
      }
      
      // Process results and convert to ResearcherRow format  
      const processedResults: ResearcherRow[] = searchResults.map((researcher: any, index: number) => {
        // If no ORCID found, preserve original data from the database
        const hasOrcid = researcher.orcid_id && researcher.orcid_id.trim() !== ''
        const originalData = researcher.original_data || {}
        
        // Use original data for basic fields when no ORCID is found
        const nom = hasOrcid ? decodeUnicode(researcher.last_name || 'Unknown') : 
                   (originalData.nom || originalData.last_name || originalData.lastname || 'Unknown')
        const prenom = hasOrcid ? decodeUnicode(researcher.first_name || 'Unknown') : 
                       (originalData.prenom || originalData.first_name || originalData.firstname || 'Unknown')
        const affiliation = hasOrcid ? (researcher.affiliation || 'N/A') : 
                           (originalData.affiliation || originalData.institution || 'N/A')
        const email = hasOrcid ? researcher.email : 
                     (originalData.email || null)
        
        return {
          id: `researcher_${index + 1}`,
          nom: decodeUnicode(nom),
          prenom: decodeUnicode(prenom), 
          affiliation: affiliation,
          email: email,
          orcid: researcher.orcid_id || null,
          orcidStatus: hasOrcid ? 'found' : 'not_found',
          selected: false,
          notes: researcher.reasoning || '',
          // New fields from DeepSeek endpoint
          first_name: decodeUnicode(researcher.first_name || prenom),
          last_name: decodeUnicode(researcher.last_name || nom),
          country: researcher.country,
          main_research_area: researcher.main_research_area,
          specific_research_area: researcher.specific_research_area,
          reasoning: researcher.reasoning,
          confidence: researcher.confidence || 0.0,
          // Convert research areas and keywords from comma-separated strings to arrays
          mainResearchFields: researcher.main_research_area ? researcher.main_research_area.split(',').map((field: string) => field.trim()) : [],
          researchKeywords: researcher.specific_research_area ? researcher.specific_research_area.split(',').map((keyword: string) => keyword.trim()) : [],
          extractionStatus: (researcher.main_research_area || researcher.specific_research_area) ? 'completed' : 
                           (hasOrcid ? 'pending' : undefined),
          originalData: originalData
        }
      })
      
      setResearcherRows(processedResults)
      
      // Also save to persistent state
      setPersistedResearcherRows(processedResults)
      setPersistedTableName(selectedTable)
      setPersistedColumns(columns.filter(c => c.selected))
      
      const orcidCount = processedResults.filter(r => r.orcid).length
      
      toast({
        title: "ORCID Search Completed",
        description: `Processed ${processedResults.length} researchers using DeepSeek agent. Found ${orcidCount} ORCID matches.`,
      })

    } catch (error: any) {
      console.error("ORCID Search Error:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to perform ORCID search",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
      setProgress(0)
      setProgressDetails(null)
    }
  }
  // Function to show saved ORCID results
  const showSavedResults = () => {
    if (persistedResearcherRows.length > 0) {
      setResearcherRows(persistedResearcherRows)
      setOrcidResultsOpen(true)
      toast({
        title: "Previous Results Loaded",
        description: `Showing ${persistedResearcherRows.length} results from table "${persistedTableName}"`,
      })
    } else {
      toast({
        title: "No Saved Results",
        description: "No previous ORCID search results found. Please run a search first.",
        variant: "destructive",
      })
    }
  }

  const handleProjectResearch = async () => {
    try {
      // Check basic requirements first
      if (!projectTitle || !projectDescription) {
        toast({
          title: "Error",
          description: "Please provide project title and description",
          variant: "destructive",
        })
        return
      }

      console.log('✅ Starting research process...')
      setIsLoading(true)
      setProgress(10)

      // Try to use similarity service first if available
      console.log('🔄 Checking similarity service availability:', similarityServiceAvailable)
      if (similarityServiceAvailable) {
        try {
          console.log('🚀 Using RAG-based similarity search...')
          
          const similarityQuery = {
            title: projectTitle,
            description: projectDescription,
            top_k: 20,
            similarity_threshold: 0.3 // Lower threshold to get more results
          }
          
          // Use detailed search for better matching information
          const matches = await similarityService.detailedSearch(similarityQuery)
          
          setProgress(50)
          
          // Transform similarity results to ProjectResearcher format
          const transformedResearchers: ProjectResearcher[] = matches.map((match) => ({
            id: match.id.toString(),
            name: `${match.prenom} ${match.nom}`,
            affiliation: decodeUnicode(match.affiliation || 'Unknown Affiliation'),
            researchAreas: match.domaines_recherche ? match.domaines_recherche.split(', ').map(area => decodeUnicode(area)) : [],
            keywords: match.mots_cles_specifiques ? match.mots_cles_specifiques.split(', ').map(keyword => decodeUnicode(keyword)) : [],
            relevanceScore: match.similarity_score,
            works: [],
            orcid: match.orcid_id,
            // Add similarity-specific fields
            similarity_score: match.similarity_score,
            matched_content: decodeUnicode(match.matched_content),
            domain_similarity: match.domain_similarity,
            keywords_similarity: match.keywords_similarity,
            best_match_type: match.best_match_type,
            domaines_recherche: decodeUnicode(match.domaines_recherche || ''),
            mots_cles_specifiques: decodeUnicode(match.mots_cles_specifiques || '')
          }))

          setProgress(80)
          setProjectResearchers(transformedResearchers)
          setProgress(100)
          
          toast({
            title: "Success",
            description: `Found ${transformedResearchers.length} researchers using RAG-enhanced similarity matching`,
          })

          return // Exit early if similarity search was successful
        } catch (similarityError) {
          console.error('Similarity service failed, falling back to standard search:', similarityError)
          toast({
            title: "Warning",
            description: "RAG service failed, using standard search instead",
            variant: "destructive",
          })
        }
      }

      // Fallback to original project research method
      setProgress(30)

      try {
        // Use backend_v2 researchers endpoint as fallback
        const response = await fetch('http://localhost:8020/api/v1/chercheurs/', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const researchers = await response.json()
        setProgress(60)

        // Simple text-based filtering for project relevance
        const projectKeywords = [
          ...projectTitle.toLowerCase().split(/\s+/),
          ...projectDescription.toLowerCase().split(/\s+/)
        ].filter(word => word.length > 2) // Filter out short words

        const relevantResearchers = researchers
          .filter((researcher: any) => {
            const searchText = [
              researcher.domaines_recherche || '',
              researcher.mots_cles_specifiques || '',
              researcher.nom || '',
              researcher.prenom || ''
            ].join(' ').toLowerCase()

            return projectKeywords.some(keyword => 
              searchText.includes(keyword.toLowerCase())
            )
          })
          .slice(0, 20) // Limit to top 20 results

        setProgress(80)

        // Transform to ProjectResearcher format
        const transformedResearchers: ProjectResearcher[] = relevantResearchers.map((researcher: any, index: number) => ({
          id: researcher.id.toString(),
          name: `${researcher.prenom || ''} ${researcher.nom || ''}`.trim(),
          affiliation: decodeUnicode(researcher.affiliation || 'Unknown Affiliation'),
          researchAreas: researcher.domaines_recherche ? 
            researcher.domaines_recherche.split(/[,;|]/).map((area: string) => decodeUnicode(area.trim())).filter(Boolean) : [],
          keywords: researcher.mots_cles_specifiques ? 
            researcher.mots_cles_specifiques.split(/[,;|]/).map((keyword: string) => decodeUnicode(keyword.trim())).filter(Boolean) : [],
          relevanceScore: 0.8 - (index * 0.02), // Simple declining relevance score
          works: [],
          orcid: researcher.orcid_id,
          domaines_recherche: decodeUnicode(researcher.domaines_recherche || ''),
          mots_cles_specifiques: decodeUnicode(researcher.mots_cles_specifiques || '')
        }))

        setProjectResearchers(transformedResearchers)
        setProgress(100)

      toast({
          title: "Success",
          description: `Found ${transformedResearchers.length} researchers using standard keyword matching`,
        })

      } catch (fallbackError) {
        console.error('Standard project research failed:', fallbackError)
        toast({
          title: "Service Unavailable",
          description: "Unable to connect to the research database. Please ensure the backend service is running on port 8020.",
          variant: "destructive",
        })
      setProgress(100)
      }
    } catch (error: any) {
      console.error("Project research failed:", error)
      toast({
        title: "Error",
        description: error.message || "Project research failed",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
      setProgress(0)
    }
  }



  // CSV Export functionality
  const exportToCSV = () => {
    const selectedRows = researcherRows.filter(r => r.selected)
    const rowsToExport = selectedRows.length > 0 ? selectedRows : researcherRows
    
    if (rowsToExport.length === 0) {
      toast({
        title: "No Data to Export",
        description: "No researchers available for export",
        variant: "destructive",
      })
      return
    }

    // Get selected column headers
    const selectedColumns = persistedColumns.length > 0 ? persistedColumns : columns.filter(c => c.selected)
    const headers = [
      ...selectedColumns.map(c => c.name),
      'ORCID ID',
      'Status',
      'Confidence',
      'Main Research Fields',
      'Research Keywords',
      'Reasoning',
      'Notes'
    ]

    // Convert data to CSV format
    const csvData = rowsToExport.map(researcher => {
      const row: string[] = []
      
      // Add data for selected columns using original data if available
      selectedColumns.forEach(column => {
        let value = ''
        
        // Try to get value from original data first
        if (researcher.originalData && researcher.originalData[column.name]) {
          value = String(researcher.originalData[column.name] || '')
        } else {
          // Fallback to mapped data
          const columnLower = column.name.toLowerCase()
          if (columnLower.includes('first') || columnLower.includes('prenom')) {
            value = researcher.prenom || ''
          } else if (columnLower.includes('last') || columnLower.includes('nom')) {
            value = researcher.nom || ''
          } else if (columnLower.includes('affiliation') || columnLower.includes('institution')) {
            value = decodeUnicode(researcher.affiliation || '')
          } else if (columnLower.includes('email')) {
            value = researcher.email || ''
          } else {
            value = '' // Empty for unknown columns
          }
        }
        
        // Escape commas and quotes in CSV
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          value = `"${value.replace(/"/g, '""')}"`
        }
        
        row.push(value)
      })
      
      // Add ORCID and status information
      row.push(researcher.orcid || 'Not found')
      row.push(researcher.orcidStatus)
      row.push(researcher.confidence !== undefined ? `${Math.round(researcher.confidence * 100)}%` : 'N/A')
      row.push(researcher.mainResearchFields?.join('; ') || 'Not extracted')
      row.push(researcher.researchKeywords?.join('; ') || 'Not extracted')
      row.push(decodeUnicode(researcher.reasoning || 'N/A'))
      row.push(researcher.notes || 'N/A')
      
      return row
    })

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.join(','))
    ].join('\n')

    // Download CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `orcid_search_results_${persistedTableName || selectedTable}_${new Date().toISOString().slice(0, 10)}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: "Export Successful",
      description: `Exported ${rowsToExport.length} researchers to CSV file`,
    })
  }

  // Function to save selected researchers to chercheurs table
  const saveSelectedResearchers = async () => {
    try {
      const selectedRows = researcherRows.filter(r => r.selected)
      
      if (selectedRows.length === 0) {
        toast({
          title: "No Selection",
          description: "Please select at least one researcher to save",
          variant: "destructive",
        })
        return
      }

      setIsLoading(true)

      // Prepare data for backend_v2 endpoint
      const chercheursData = selectedRows.map(researcher => ({
        nom: researcher.nom,
        prenom: researcher.prenom,
        affiliation: researcher.affiliation || "",
        orcid_id: researcher.orcid || "",
        domaine_recherche: researcher.mainResearchFields ? researcher.mainResearchFields.join(", ") : "",
        mots_cles_specifiques: researcher.researchKeywords ? researcher.researchKeywords.join(", ") : ""
      }))

      // Call the backend_v2 chercheurs save endpoint
      const saveResponse = await fetch("http://localhost:8020/api/v1/chercheurs/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chercheurs: chercheursData
        }),
      })

      if (!saveResponse.ok) {
        throw new Error(`HTTP ${saveResponse.status}: ${await saveResponse.text()}`)
      }

      const saveResult = await saveResponse.json()
      
      // Handle the response with potential duplicates
      const savedCount = saveResult.saved_count || 0
      const duplicateCount = saveResult.duplicate_count || 0
      const failedCount = saveResult.failed_count || 0
      
      // Check if any affiliations were truncated (longer than 255 chars)
      const truncatedAffiliations = chercheursData.filter(chercheur => 
        chercheur.affiliation && chercheur.affiliation.length > 255
      )
      
      // Update persistent state with the current data
      setPersistedResearcherRows(researcherRows)
      
      // Show appropriate toast based on results
      if (duplicateCount > 0) {
        // Show alert with duplicate information and option to overwrite
        const duplicateNames = saveResult.duplicates?.map((d: any) => `${d.prenom} ${d.nom} (${d.orcid_id})`).join(', ') || ''
        
        const shouldOverwrite = window.confirm(
          `${savedCount} researchers saved successfully.\n\n` +
          `${duplicateCount} researchers already exist in the database:\n${duplicateNames}\n\n` +
          `Would you like to overwrite the existing researchers with the new data?`
        )
        
        if (shouldOverwrite) {
          // Call the overwrite endpoint
          const overwriteResponse = await fetch("http://localhost:8020/api/v1/chercheurs/overwrite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chercheurs: chercheursData
            }),
          })
          
          if (overwriteResponse.ok) {
            const overwriteResult = await overwriteResponse.json()
            toast({
              title: "Overwrite Successful",
              description: `Successfully overwrote ${overwriteResult.overwritten_count} researchers in the database.`,
            })
            
            // Show warning if affiliations were truncated during overwrite
            if (truncatedAffiliations.length > 0) {
              toast({
                title: "Affiliations Truncated",
                description: `${truncatedAffiliations.length} researcher affiliations were truncated to 255 characters during overwrite.`,
                variant: "destructive",
              })
            }
          } else {
            throw new Error(`Failed to overwrite: ${await overwriteResponse.text()}`)
          }
        } else {
          toast({
            title: "Save Completed",
            description: `${savedCount} new researchers saved. ${duplicateCount} existing researchers were skipped.`,
          })
        }
      } else {
        // No duplicates, show success message
        toast({
          title: "Save Successful",
          description: `Successfully saved ${savedCount} researchers to chercheurs database.`,
        })
      }
      
      // Show warning if there were failures
      if (failedCount > 0) {
        toast({
          title: "Some Failures",
          description: `${failedCount} researchers failed to save. Check the console for details.`,
          variant: "destructive",
        })
        console.log("Failed researchers:", saveResult.failed)
      }
      
      // Show warning if affiliations were truncated
      if (truncatedAffiliations.length > 0) {
        toast({
          title: "Affiliations Truncated",
          description: `${truncatedAffiliations.length} researcher affiliations were truncated to 255 characters due to database field limits.`,
          variant: "destructive",
        })
        console.log("Truncated affiliations:", truncatedAffiliations.map(c => ({ name: `${c.prenom} ${c.nom}`, affiliation: c.affiliation })))
      }

      console.log("Save result:", saveResult)

    } catch (error: any) {
      console.error('Save Error:', error)
      toast({
        title: "Save Failed", 
        description: error.message || "Failed to save researchers to database",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthGuard>
      <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Data Management & Matching Dashboard</h1>
        <p className="text-muted-foreground">
          Comprehensive tool for managing researcher data, ORCID matching, and project-based research discovery
        </p>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="table-orcid-search">Table ORCID Search</TabsTrigger>
          <TabsTrigger value="single-orcid-search">Single ORCID Search</TabsTrigger>
          <TabsTrigger value="project-research">Project Research</TabsTrigger>
        </TabsList>







        <TabsContent value="table-orcid-search">
          <TableOrcidSearch 
            databases={databases}
            selectedDatabase={selectedDatabase}
            setSelectedDatabase={handleDatabaseSelection}
            tables={tables}
            selectedTable={selectedTable}
            setSelectedTable={handleTableSelection}
            columns={columns}
            setColumns={setColumns}
            handleLoadSchema={handleLoadSchema}
            handleTableOrcidSearch={handleTableOrcidSearch}
            isLoading={isLoading}
            progress={progress}
            progressDetails={progressDetails}
            researcherRows={researcherRows}
            setResearcherRows={setResearcherRows}
            setOrcidProfileModalOpen={setOrcidProfileModalOpen}
            setSelectedOrcidId={setSelectedOrcidId}
            setSelectedResearcherName={setSelectedResearcherName}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            apiKeys={apiKeys}
            exportToCSV={exportToCSV}
            showSavedResults={showSavedResults}
            persistedResearcherRows={persistedResearcherRows}
            persistedTableName={persistedTableName}
            saveSelectedResearchers={saveSelectedResearchers}
            filterText={filterText}
            setFilterText={setFilterText}
            extractResearchFieldsForAll={extractResearchFieldsForAll}
            expandedFields={expandedFields}
            setExpandedFields={setExpandedFields}
            expandedKeywords={expandedKeywords}
            setExpandedKeywords={setExpandedKeywords}
          />
        </TabsContent>

        <TabsContent value="single-orcid-search">
          <ResearcherMatching 
            databases={databases}
            selectedDatabase={selectedDatabase}
            setSelectedDatabase={setSelectedDatabase}
            isLoading={isLoading}
            progress={progress}
            // New props for single researcher ORCID search
            tables={tables}
            selectedTable={selectedTable}
            setSelectedTable={setSelectedTable}
            columns={columns}
            setColumns={setColumns}
            handleLoadSchema={handleLoadSchema}
            handleDatabaseSelection={handleDatabaseSelection}
            handleTableSelection={handleTableSelection}
            tableRows={tableRows}
            setTableRows={setTableRows}
            searchSingleResearcherORCID={async (researcherData: any) => {
              // This function is not used in the current implementation
              // The ORCID search is handled directly in the component
              return {}
            }}
            setOrcidProfileModalOpen={setOrcidProfileModalOpen}
            setSelectedOrcidId={setSelectedOrcidId}
            setSelectedResearcherName={setSelectedResearcherName}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            apiKeys={apiKeys}
          />
        </TabsContent>

        <TabsContent value="project-research">
          <ProjectResearch 
            projectTitle={projectTitle}
            updateProjectTitle={updateProjectTitle}
            projectDescription={projectDescription}
            updateProjectDescription={updateProjectDescription}
            handleProjectResearch={handleProjectResearch}
            isLoading={isLoading}
            progress={progress}
            projectResearchers={projectResearchers}
            setOrcidProfileModalOpen={setOrcidProfileModalOpen}
            setSelectedOrcidId={setSelectedOrcidId}
            setSelectedResearcherName={setSelectedResearcherName}
            similarityServiceAvailable={similarityServiceAvailable}
            checkSimilarityService={checkSimilarityService}
          />
        </TabsContent>
      </Tabs>

      {/* Schema Modal */}
      {/* ORCID Profile Modal */}
      <ORCIDProfileModal 
        isOpen={orcidProfileModalOpen}
        onClose={() => setOrcidProfileModalOpen(false)}
        orcidId={selectedOrcidId}
        researcherName={selectedResearcherName}
      />

      {/* API Keys Modal */}
      <ApiKeysModal 
        isOpen={viewApiKeysModalOpen}
        onClose={() => setViewApiKeysModalOpen(false)}
        apiKeys={savedApiKeys}
      />

      {/* Schema Modal */}
      <SchemaModal 
        isOpen={schemaModalOpen}
        onClose={() => setSchemaModalOpen(false)}
        schemaData={schemaData}
        databaseName={selectedSchemaDatabase}
      />
      </div>
    </AuthGuard>
  )
}
