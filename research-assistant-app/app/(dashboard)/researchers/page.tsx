"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useRouter } from "next/navigation"
import AuthGuard from "@/components/AuthGuard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { 
  Search, Plus, MoreHorizontal, Edit, Trash2, Eye, User, ExternalLink, 
  Building, BookOpen, Tags, Loader2, ChevronDown, FileText, RefreshCw, AlertTriangle, AlertCircle 
} from "lucide-react"
import { 
  getResearchers, 
  createResearcher, 
  updateResearcher, 
  deleteResearcher,
  getResearcher,
  type Researcher as DBResearcher, 
  type ResearcherCreate 
} from "@/services/researcherService"
import { dataManagementService } from "@/services/dataManagementService"
import { similarityService, type ResearcherMatch, type DetailedResearcherMatch } from "@/services/similarityService"

interface Researcher extends DBResearcher {
  // Add computed fields for display
  domains_array?: string[];
  keywords_array?: string[];
}

// ORCID Profile interfaces
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

export default function ResearchersPage() {
  const [researchers, setResearchers] = useState<Researcher[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedResearcher, setSelectedResearcher] = useState<Researcher | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
  const [formData, setFormData] = useState<Partial<ResearcherCreate>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // ORCID Profile Modal states
  const [isORCIDProfileOpen, setIsORCIDProfileOpen] = useState(false)
  const [currentORCIDId, setCurrentORCIDId] = useState<string>("")
  const [currentResearcherName, setCurrentResearcherName] = useState<string>("")
  const [orcidProfileData, setORCIDProfileData] = useState<any>(null)
  const [isLoadingORCID, setIsLoadingORCID] = useState(false)
  const [orcidError, setORCIDError] = useState<string>("")
  
  // Similarity search states
  const [isSimilaritySearchOpen, setIsSimilaritySearchOpen] = useState(false)
  const [projectTitle, setProjectTitle] = useState("")
  const [projectDescription, setProjectDescription] = useState("")
  const [similaritySearchResults, setSimilaritySearchResults] = useState<any[]>([])
  const [isSearchingSimilarity, setIsSearchingSimilarity] = useState(false)
  
  // Expanded fields state for Research Areas and Keywords
  const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>({})
  const [expandedKeywords, setExpandedKeywords] = useState<Record<string, boolean>>({})
  
  const { toast } = useToast()

  // Refresh RAG index
  const [isRefreshingRAG, setIsRefreshingRAG] = useState(false)
  const handleRefreshRAG = async () => {
    setIsRefreshingRAG(true)
    try {
      await similarityService.refreshData()
      toast({
        title: "RAG Index Refreshed",
        description: "The similarity index has been refreshed from the database.",
      })
    } catch (error: any) {
      toast({
        title: "Refresh Failed",
        description: error.message || "Failed to refresh RAG index",
        variant: "destructive",
      })
    } finally {
      setIsRefreshingRAG(false)
    }
  }

  // Load researchers from database
  const loadResearchers = async () => {
    try {
      setLoading(true)
      const data = await getResearchers()
      
      // Process the data to create arrays from comma-separated strings
      const processedData = data.map(researcher => ({
        ...researcher,
        domains_array: researcher.domaines_recherche 
          ? researcher.domaines_recherche.split(',').map(s => s.trim()).filter(Boolean)
          : [],
        keywords_array: researcher.mots_cles_specifiques
          ? researcher.mots_cles_specifiques.split(',').map(s => s.trim()).filter(Boolean) 
          : []
      }))
      
      setResearchers(processedData)
    } catch (error: any) {
      console.error("Failed to load researchers:", error)
      toast({
        title: "Error",
        description: "Failed to load researchers from database",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Load researchers on component mount
  useEffect(() => {
    loadResearchers()
  }, [])

  // Load ORCID profile function
  const loadORCIDProfile = async (orcidId: string) => {
    try {
      setIsLoadingORCID(true)
      setORCIDError("")
      const response = await dataManagementService.getORCIDProfile(orcidId, true, 5)
      setORCIDProfileData(response)
    } catch (err: any) {
      console.error("Failed to load ORCID profile:", err)
      setORCIDError(err.message || "Failed to load profile")
    } finally {
      setIsLoadingORCID(false)
    }
  }

  // Open ORCID profile modal
  const handleViewORCIDProfile = (researcher: Researcher) => {
    if (!researcher.orcid_id) {
      toast({
        title: "No ORCID ID",
        description: "This researcher doesn't have an ORCID ID registered",
        variant: "destructive",
      })
      return
    }
    
    setCurrentORCIDId(researcher.orcid_id)
    setCurrentResearcherName(`${researcher.prenom} ${researcher.nom}`)
    setORCIDProfileData(null) // Clear previous data
    setORCIDError("") // Clear previous errors
    setIsORCIDProfileOpen(true)
    
    // Load profile data
    loadORCIDProfile(researcher.orcid_id)
  }

  // Filter researchers based on search term
  const filteredResearchers = researchers.filter(
    (researcher) =>
      researcher.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      researcher.prenom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (researcher.affiliation && researcher.affiliation.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (researcher.orcid_id && researcher.orcid_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (researcher.domaines_recherche && researcher.domaines_recherche.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (researcher.mots_cles_specifiques && researcher.mots_cles_specifiques.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const handleAdd = () => {
    setFormData({})
    setSelectedResearcher(null)
    setIsAddDialogOpen(true)
  }

  const handleEdit = (researcher: Researcher) => {
    setFormData({
      nom: researcher.nom,
      prenom: researcher.prenom,
      affiliation: researcher.affiliation || "",
      orcid_id: researcher.orcid_id || "",
      domaines_recherche: researcher.domaines_recherche || "",
      mots_cles_specifiques: researcher.mots_cles_specifiques || ""
    })
    setSelectedResearcher(researcher)
    setIsEditDialogOpen(true)
  }

  const handleView = async (researcher: Researcher) => {
    try {
      // Load full researcher details
      const fullResearcher = await getResearcher(researcher.id)
      setSelectedResearcher({
        ...fullResearcher,
        domains_array: fullResearcher.domaines_recherche
          ? fullResearcher.domaines_recherche.split(',').map(s => s.trim()).filter(Boolean)
          : [],
        keywords_array: fullResearcher.mots_cles_specifiques
          ? fullResearcher.mots_cles_specifiques.split(',').map(s => s.trim()).filter(Boolean) 
          : []
      })
      setIsViewDialogOpen(true)
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load researcher details",
        variant: "destructive",
      })
    }
  }

  const handleDelete = async (researcher: Researcher) => {
    if (!confirm(`Are you sure you want to delete ${researcher.prenom} ${researcher.nom}?`)) {
      return
    }
    
    try {
      await deleteResearcher(researcher.id)
      toast({
        title: "Success",
        description: `${researcher.prenom} ${researcher.nom} has been deleted`,
      })
      loadResearchers() // Refresh the list
    } catch (error: any) {
      toast({
        title: "Error", 
        description: "Failed to delete researcher",
        variant: "destructive",
      })
    }
  }

  const handleSimilaritySearch = async () => {
    if (!projectTitle.trim() && !projectDescription.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter either a project title or description",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSearchingSimilarity(true)
      const query = projectTitle.trim() || projectDescription.trim()
      const results = await similarityService.searchResearchers({
        title: projectTitle.trim(),
        description: projectDescription.trim(),
        top_k: 10
      })
      setSimilaritySearchResults(results)
      toast({
        title: "Success",
        description: `Found ${results.length} relevant researchers`,
      })
    } catch (error) {
      console.error('Similarity search error:', error)
      toast({
        title: "Error",
        description: "Failed to search for similar researchers. Using standard search.",
        variant: "destructive",
      })
      // Fallback to regular search
      const fallbackTerm = projectTitle.trim() || projectDescription.trim()
      setSearchTerm(fallbackTerm)
      setSimilaritySearchResults([])
    } finally {
      setIsSearchingSimilarity(false)
    }
  }

  const handleSave = async () => {
    if (!formData.nom || !formData.prenom) {
      toast({
        title: "Validation Error",
        description: "Name and first name are required",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSubmitting(true)
      
      if (selectedResearcher) {
        // Edit existing
        await updateResearcher({
          id: selectedResearcher.id,
          ...(formData as ResearcherCreate)
        })
        toast({
          title: "Success",
          description: "Researcher updated successfully",
        })
        setIsEditDialogOpen(false)
      } else {
        // Add new
        await createResearcher(formData as ResearcherCreate)
        toast({
          title: "Success",
          description: "Researcher created successfully",
        })
        setIsAddDialogOpen(false)
      }
      
      loadResearchers() // Refresh the list
    } catch (error: any) {
      // Handle duplicate ORCID case
      if (error.message && error.message.includes("already exists")) {
        const shouldOverwrite = window.confirm(
          `${error.message}\n\nWould you like to update the existing researcher with the new information?`
        )
        
        if (shouldOverwrite) {
          try {
            // Extract the existing researcher ID from the error message
            const match = error.message.match(/ID: (\d+)/)
            if (match) {
              const existingId = parseInt(match[1])
              await updateResearcher({
                id: existingId,
                ...(formData as ResearcherCreate)
              })
              toast({
                title: "Success",
                description: "Existing researcher updated successfully",
              })
              setIsAddDialogOpen(false)
              loadResearchers() // Refresh the list
            } else {
              toast({
                title: "Error",
                description: "Could not identify existing researcher to update",
                variant: "destructive",
              })
            }
          } catch (updateError: any) {
            toast({
              title: "Error",
              description: `Failed to update existing researcher: ${updateError.message}`,
              variant: "destructive",
            })
          }
        } else {
          toast({
            title: "Cancelled",
            description: "Researcher creation cancelled",
          })
        }
      } else {
        toast({
          title: "Error",
          description: `Failed to ${selectedResearcher ? 'update' : 'create'} researcher: ${error.message}`,
          variant: "destructive",
        })
      }
    } finally {
      setIsSubmitting(false)
    }
    
    setFormData({})
    setSelectedResearcher(null)
  }

  const handleInputChange = useCallback((field: keyof ResearcherCreate, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }, [])



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
            const org = match[1].trim().replace(/['"]/g, '')
            if (org && !affiliations.includes(org)) {
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
            const field = match[1].trim().replace(/['"]/g, '')
            if (field && !fields.includes(field)) {
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
              const keyword = match.trim().replace(/['"]/g, '')
              if (keyword && !keywords.includes(keyword)) {
                keywords.push(keyword)
              }
            })
          }
        }
      }
    }
    
    return keywords.length > 0 ? keywords.slice(0, 15) : ['No specific keywords identified']
  }

  const renderORCIDProfileContent = () => {
    if (isLoadingORCID) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading ORCID profile...</span>
        </div>
      )
    }

    if (orcidError) {
      return (
        <div className="text-center py-8">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600">{orcidError}</p>
          <Button onClick={() => loadORCIDProfile(currentORCIDId)} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      )
    }

    if (!orcidProfileData) {
      return <div className="py-8 text-center text-muted-foreground">No profile data available</div>
    }

    // Use structured data if available, otherwise fall back to text parsing
    const structuredData: ORCIDStructuredData | undefined = orcidProfileData.structured_data
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
        if (typeof orcidProfileData.profile === 'string') {
          profileText = orcidProfileData.profile
        } else {
          profileText = JSON.stringify(orcidProfileData.profile, null, 2)
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
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xl">
              {currentResearcherName.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900">{currentResearcherName}</h3>
              <div className="flex items-center mt-1">
                <ExternalLink className="h-4 w-4 mr-1 text-green-600" />
                <a 
                  href={`https://orcid.org/${currentORCIDId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-600 hover:text-green-700 text-sm font-medium"
                >
                  ORCID: {currentORCIDId}
                </a>
              </div>
              {/* Show primary affiliation if available */}
              {affiliations && affiliations.length > 0 && affiliations[0] !== 'No affiliations found in profile' && (
                <div className="mt-2">
                  <span className="text-sm text-gray-600 bg-white px-2 py-1 rounded border">
                    {affiliations[0]}
                  </span>
                </div>
              )}
              {/* Show profile statistics */}
              <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                {structuredData?.total_works && (
                  <span className="flex items-center">
                    <FileText className="h-3 w-3 mr-1" />
                    {structuredData.total_works} works
                  </span>
                )}
                {affiliations && affiliations.length > 0 && (
                  <span className="flex items-center">
                    <Building className="h-3 w-3 mr-1" />
                    {affiliations.length} affiliations
                  </span>
                )}
                {keywords && keywords.length > 0 && (
                  <span className="flex items-center">
                    <Tags className="h-3 w-3 mr-1" />
                    {keywords.length} keywords
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 3-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Affiliations */}
          <div className="bg-white border rounded-lg p-4">
            <h4 className="font-semibold mb-3 flex items-center text-blue-700">
              <Building className="h-5 w-5 mr-2" />
              Affiliations
            </h4>
            <div className="space-y-2">
              {affiliations.map((affiliation, index) => (
                <div key={index} className="flex items-center">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                  <span className="text-sm">{affiliation}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Research Fields */}
          <div className="bg-white border rounded-lg p-4">
            <h4 className="font-semibold mb-3 flex items-center text-green-700">
              <BookOpen className="h-5 w-5 mr-2" />
              Research Fields
            </h4>
            <div className="space-y-2">
              {researchFields.map((field, index) => (
                <div key={index} className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                  <span className="text-sm">{field}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Keywords */}
          <div className="bg-white border rounded-lg p-4">
            <h4 className="font-semibold mb-3 flex items-center text-purple-700">
              <Tags className="h-5 w-5 mr-2" />
              Keywords
            </h4>
            <div className="flex flex-wrap gap-2">
              {keywords.map((keyword, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {keyword}
                </Badge>
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
                    <a href={structuredData.scopus_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-xs hover:bg-orange-200">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Scopus
                    </a>
                  )}
                  {structuredData?.linkedin_url && (
                    <a href={structuredData.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs hover:bg-blue-200">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      LinkedIn
                    </a>
                  )}
                  {structuredData?.google_scholar && (
                    <a href={structuredData.google_scholar} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs hover:bg-green-200">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Google Scholar
                    </a>
                  )}
                  {structuredData?.researchgate && (
                    <a href={structuredData.researchgate} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 py-1 bg-teal-100 text-teal-800 rounded-full text-xs hover:bg-teal-200">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      ResearchGate
                    </a>
                  )}
                  {structuredData?.researcherid_url && (
                    <a href={structuredData.researcherid_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs hover:bg-purple-200">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      ResearcherID
                    </a>
                  )}
                  {structuredData?.publons_url && (
                    <a href={structuredData.publons_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs hover:bg-indigo-200">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Publons
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
                      <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                        <span className="text-xs font-medium text-gray-600">{identifier.type}</span>
                        <span className="text-xs font-mono bg-white px-2 py-1 rounded">{identifier.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Researcher URLs */}
              {structuredData?.researcher_urls && structuredData.researcher_urls.length > 0 && (
                <div>
                  <h5 className="font-medium text-sm text-gray-700 mb-2">Personal URLs</h5>
                  <div className="space-y-2">
                    {structuredData.researcher_urls.map((urlItem, index) => (
                      <div key={index} className="bg-gray-50 p-2 rounded">
                        <div className="text-xs font-medium text-gray-600 mb-1">{urlItem.name}</div>
                        <a 
                          href={urlItem.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800 break-all"
                        >
                          {urlItem.url}
                        </a>
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
                    <div key={index} className="bg-gray-50 p-2 rounded">
                      <div className="text-xs font-medium text-gray-600 mb-1">{website.name}</div>
                      <a 
                        href={website.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-800 break-all"
                      >
                        {website.url}
                      </a>
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
                  {structuredData.emails.map((emailObj, index) => (
                    <div key={index} className="bg-gray-50 p-2 rounded">
                      <a 
                        href={`mailto:${typeof emailObj === 'string' ? emailObj : emailObj.email}`}
                        className="text-sm text-gray-800 hover:text-blue-600"
                      >
                        {typeof emailObj === 'string' ? emailObj : emailObj.email}
                      </a>
                      {typeof emailObj !== 'string' && emailObj.verified && (
                        <Badge className="ml-2 text-xs" variant="secondary">Verified</Badge>
                      )}
                      {typeof emailObj !== 'string' && emailObj.primary && (
                        <Badge className="ml-2 text-xs" variant="default">Primary</Badge>
                      )}
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
              Recent Research Works ({structuredData.total_works || structuredData.work_titles.length} total)
            </h4>
            <div className="space-y-2">
              {structuredData.work_titles.map((title: string, index: number) => (
                <div key={index} className="flex items-center">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full mr-3"></div>
                  <span className="text-sm">{title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Database Information */}
        <div className="bg-white border rounded-lg p-4">
          <h4 className="font-semibold mb-3 flex items-center text-gray-700">
            <Building className="h-5 w-5 mr-2" />
            Database Information
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">ORCID ID</Label>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">{currentORCIDId}</span>
                <a 
                  href={`https://orcid.org/${currentORCIDId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-600 hover:text-green-700"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Profile Status</Label>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-green-600">Active & Public</span>
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Last Updated</Label>
              <span className="text-sm text-gray-600">
                {orcidProfileData?.last_modified_date ? 
                  new Date(orcidProfileData.last_modified_date).toLocaleDateString() : 
                  'Unknown'
                }
              </span>
            </div>
          </div>
        </div>

        {/* Raw Profile Data (Collapsible) */}
        <div className="bg-white border rounded-lg">
          <details className="group">
            <summary className="cursor-pointer p-4 font-semibold flex items-center hover:bg-gray-50 rounded-lg">
              <FileText className="h-5 w-5 mr-2" />
              Raw Profile Data
              <ChevronDown className="h-4 w-4 ml-auto group-open:rotate-180 transition-transform" />
            </summary>
            <div className="px-4 pb-4">
              <ScrollArea className="h-48">
                <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(orcidProfileData, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          </details>
        </div>
      </div>
    )
  }

  return (
    <AuthGuard>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Researchers Directory</h1>
          <p className="text-muted-foreground">Manage and explore researcher profiles and expertise</p>
        </div>
        <div className="flex gap-2">
          {/* <Button
            variant="outline"
            onClick={() => setIsSimilaritySearchOpen(true)}
          >
            <Search className="mr-2 h-4 w-4" />
            Find Relevant Researchers
          </Button> */}
          <Button
            variant="outline"
            onClick={handleRefreshRAG}
            disabled={isRefreshingRAG}
          >
            <RefreshCw className={"mr-2 h-4 w-4 " + (isRefreshingRAG ? "animate-spin" : "")}/>
            {isRefreshingRAG ? "Refreshing..." : "Refresh RAG Index"}
          </Button>
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Researcher
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search Researchers</CardTitle>
          <CardDescription>Search by name, affiliation, research areas, or keywords</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search researchers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Researchers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Researchers ({filteredResearchers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Affiliation</TableHead>
                <TableHead>ORCID ID</TableHead>
                <TableHead>Research Areas</TableHead>
                <TableHead>Keywords</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredResearchers.map((researcher) => (
                <TableRow key={researcher.id}>
                  <TableCell className="font-medium">
                    {researcher.prenom} {researcher.nom}
                  </TableCell>
                  <TableCell>{researcher.affiliation}</TableCell>
                  <TableCell>
                    {researcher.orcid_id ? (
                      <div className="flex items-center space-x-2">
                        <a 
                          href={`https://orcid.org/${researcher.orcid_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 hover:underline font-mono text-sm"
                          title="Open ORCID profile in new window"
                        >
                          {researcher.orcid_id}
                        </a>
                        <ExternalLink className="h-3 w-3 text-gray-400" />
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">No ORCID</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {researcher.domains_array && researcher.domains_array.length > 0 ? (
                        <>
                          {(expandedDomains[researcher.id] ? researcher.domains_array : researcher.domains_array.slice(0, 2)).map((area, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {area}
                            </Badge>
                          ))}
                          {researcher.domains_array.length > 2 && (
                            <Badge 
                              variant="outline" 
                              className="text-xs cursor-pointer hover:bg-secondary/80 transition-colors"
                              onClick={() => {
                                setExpandedDomains(prev => ({
                                  ...prev,
                                  [researcher.id]: !prev[researcher.id]
                                }))
                              }}
                              title={expandedDomains[researcher.id] ? "Show less" : "Show all research areas"}
                            >
                              {expandedDomains[researcher.id] 
                                ? "Show less" 
                                : `+${researcher.domains_array.length - 2} more`
                              }
                            </Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground text-xs">No domains listed</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {researcher.keywords_array && researcher.keywords_array.length > 0 ? (
                        <>
                          {(expandedKeywords[researcher.id] ? researcher.keywords_array : researcher.keywords_array.slice(0, 2)).map((keyword, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {keyword}
                            </Badge>
                          ))}
                          {researcher.keywords_array.length > 2 && (
                            <Badge 
                              variant="outline" 
                              className="text-xs cursor-pointer hover:bg-secondary/80 transition-colors"
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
                                : `+${researcher.keywords_array.length - 2} more`
                              }
                            </Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground text-xs">No keywords listed</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleView(researcher)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        {researcher.orcid_id && (
                          <DropdownMenuItem onClick={() => handleViewORCIDProfile(researcher)}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            View ORCID Profile
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleEdit(researcher)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(researcher)} className="text-red-600">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Researcher Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Researcher</DialogTitle>
            <DialogDescription>Enter the researcher's information below</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="add-prenom">First Name</Label>
                <Input
                  id="add-prenom"
                  value={formData.prenom || ""}
                  onChange={(e) => handleInputChange("prenom", e.target.value)}
                  placeholder="Enter first name"
                />
              </div>
              <div>
                <Label htmlFor="add-nom">Last Name</Label>
                <Input
                  id="add-nom"
                  value={formData.nom || ""}
                  onChange={(e) => handleInputChange("nom", e.target.value)}
                  placeholder="Enter last name"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="add-affiliation">Affiliation</Label>
              <Input
                id="add-affiliation"
                value={formData.affiliation || ""}
                onChange={(e) => handleInputChange("affiliation", e.target.value)}
                placeholder="Enter affiliation"
              />
            </div>
            <div>
              <Label htmlFor="add-orcid_id">ORCID ID</Label>
              <Input
                id="add-orcid_id"
                value={formData.orcid_id || ""}
                onChange={(e) => handleInputChange("orcid_id", e.target.value)}
                placeholder="Enter ORCID ID (e.g., 0000-0000-0000-0000)"
                maxLength={19}
              />
            </div>
            <div>
              <Label htmlFor="add-domaines_recherche">Research Domains (comma-separated)</Label>
              <Input
                id="add-domaines_recherche"
                value={formData.domaines_recherche || ""}
                onChange={(e) => handleInputChange("domaines_recherche", e.target.value)}
                placeholder="e.g., Machine Learning, Computer Vision"
              />
            </div>
            <div>
              <Label htmlFor="add-mots_cles_specifiques">Specific Keywords (comma-separated)</Label>
              <Input
                id="add-mots_cles_specifiques"
                value={formData.mots_cles_specifiques || ""}
                onChange={(e) => handleInputChange("mots_cles_specifiques", e.target.value)}
                placeholder="e.g., Deep Learning, Neural Networks"
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Add Researcher</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Researcher Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Researcher</DialogTitle>
            <DialogDescription>Update the researcher's information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-prenom">First Name</Label>
                <Input
                  id="edit-prenom"
                  value={formData.prenom || ""}
                  onChange={(e) => handleInputChange("prenom", e.target.value)}
                  placeholder="Enter first name"
                />
              </div>
              <div>
                <Label htmlFor="edit-nom">Last Name</Label>
                <Input
                  id="edit-nom"
                  value={formData.nom || ""}
                  onChange={(e) => handleInputChange("nom", e.target.value)}
                  placeholder="Enter last name"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-affiliation">Affiliation</Label>
              <Input
                id="edit-affiliation"
                value={formData.affiliation || ""}
                onChange={(e) => handleInputChange("affiliation", e.target.value)}
                placeholder="Enter affiliation"
              />
            </div>
            <div>
              <Label htmlFor="edit-orcid_id">ORCID ID</Label>
              <Input
                id="edit-orcid_id"
                value={formData.orcid_id || ""}
                onChange={(e) => handleInputChange("orcid_id", e.target.value)}
                placeholder="Enter ORCID ID (e.g., 0000-0000-0000-0000)"
                maxLength={19}
              />
            </div>
            <div>
              <Label htmlFor="edit-domaines_recherche">Research Domains (comma-separated)</Label>
              <Input
                id="edit-domaines_recherche"
                value={formData.domaines_recherche || ""}
                onChange={(e) => handleInputChange("domaines_recherche", e.target.value)}
                placeholder="e.g., Machine Learning, Computer Vision"
              />
            </div>
            <div>
              <Label htmlFor="edit-mots_cles_specifiques">Specific Keywords (comma-separated)</Label>
              <Input
                id="edit-mots_cles_specifiques"
                value={formData.mots_cles_specifiques || ""}
                onChange={(e) => handleInputChange("mots_cles_specifiques", e.target.value)}
                placeholder="e.g., Deep Learning, Neural Networks"
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Researcher Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>Researcher Details</span>
            </DialogTitle>
          </DialogHeader>
          {selectedResearcher && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Name</Label>
                  <p className="text-lg font-semibold">
                    {selectedResearcher.prenom} {selectedResearcher.nom}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Affiliation</Label>
                  <p>{selectedResearcher.affiliation}</p>
                </div>
              </div>

              {selectedResearcher.orcid_id && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">ORCID ID</Label>
                  <p>{selectedResearcher.orcid_id}</p>
                </div>
              )}

              <div>
                <Label className="text-sm font-medium text-muted-foreground">Research Domains</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {selectedResearcher.domains_array && selectedResearcher.domains_array.length > 0 ? (
                    selectedResearcher.domains_array.map((area, index) => (
                      <Badge key={index} variant="secondary">
                        {area}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-sm">No research domains listed</span>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">Specific Keywords</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {selectedResearcher.keywords_array && selectedResearcher.keywords_array.length > 0 ? (
                    selectedResearcher.keywords_array.map((keyword, index) => (
                      <Badge key={index} variant="outline">
                        {keyword}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-sm">No specific keywords listed</span>
                  )}
                </div>
              </div>

            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ORCID Profile Modal */}
      <Dialog open={isORCIDProfileOpen} onOpenChange={setIsORCIDProfileOpen}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center space-x-2">
              <Search className="h-5 w-5" />
              <span>ORCID Profile Details</span>
            </DialogTitle>
            <DialogDescription>
              Detailed profile information from ORCID database for {currentResearcherName}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 min-h-0 overflow-y-auto px-4">
            {renderORCIDProfileContent()}
          </div>
          
          {/* Action buttons - Fixed at bottom */}
          <div className="flex justify-between items-center pt-4 border-t flex-shrink-0">
            <div className="flex items-center space-x-4 text-xs text-gray-500">
              <span>Profile loaded: {new Date().toLocaleTimeString()}</span>
              {orcidProfileData?.last_modified_date && (
                <span>Last modified: {new Date(orcidProfileData.last_modified_date).toLocaleDateString()}</span>
              )}
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={() => loadORCIDProfile(currentORCIDId)}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button variant="outline" onClick={() => window.open(`https://orcid.org/${currentORCIDId}`, '_blank')}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in ORCID
              </Button>
              <Button onClick={() => setIsORCIDProfileOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Similarity Search Dialog */}
      <Dialog open={isSimilaritySearchOpen} onOpenChange={setIsSimilaritySearchOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Find Relevant Researchers</DialogTitle>
            <DialogDescription>
              Describe your project to find researchers with similar expertise and interests
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="projectTitle">Project Title</Label>
              <Input
                id="projectTitle"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                placeholder="Enter your project title..."
              />
            </div>
            
            <div>
              <Label htmlFor="projectDescription">Project Description</Label>
              <Textarea
                id="projectDescription"
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Describe your project, research goals, and methodology..."
                rows={4}
              />
            </div>
            
            <div className="flex space-x-2">
              <Button 
                onClick={handleSimilaritySearch}
                disabled={isSearchingSimilarity}
                className="flex-1"
              >
                {isSearchingSimilarity ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Search Similar Researchers
                  </>
                )}
              </Button>
              
              <Button 
                variant="outline" 
                onClick={() => {
                  setProjectTitle("")
                  setProjectDescription("")
                  setSimilaritySearchResults([])
                }}
              >
                Clear
              </Button>
            </div>
            
            {/* Results */}
            {similaritySearchResults.length === 0 && !isSearchingSimilarity && (
              <div className="border-t pt-4 text-center text-muted-foreground">
                <AlertCircle className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                <div className="font-semibold">No relevant researchers found</div>
                <div className="text-sm">Try a different project description or refresh the RAG index.</div>
              </div>
            )}
            {similaritySearchResults.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-4">Similar Researchers ({similaritySearchResults.length})</h3>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    {similaritySearchResults.map((result, index) => {
                      let badgeColor = "bg-gray-200 text-gray-800"
                      let simText = ""
                      if (typeof result.similarity_score === "number") {
                        if (result.similarity_score >= 0.7) {
                          badgeColor = "bg-green-200 text-green-800"
                          simText = "High similarity"
                        } else if (result.similarity_score >= 0.4) {
                          badgeColor = "bg-yellow-200 text-yellow-800"
                          simText = "Medium similarity"
                        } else {
                          badgeColor = "bg-red-200 text-red-800"
                          simText = "Low similarity"
                        }
                      }
                      return (
                        <Card key={index} className="p-4">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <h4 className="font-semibold">
                                  {result.prenom} {result.nom}
                                </h4>
                                <span className={`rounded px-2 py-1 text-xs font-semibold ${badgeColor}`}>
                                  {(result.similarity_score * 100).toFixed(1)}% match
                                  {simText && (
                                    <span className="ml-2 italic">({simText})</span>
                                  )}
                                </span>
                              </div>
                              {result.affiliation && (
                                <p className="text-sm text-gray-600 mb-2">{result.affiliation}</p>
                              )}
                              {result.domaines_recherche && (
                                <div className="mb-2">
                                  <p className="text-sm font-medium mb-1">Research Areas:</p>
                                  <div className="flex flex-wrap gap-1">
                                    {result.domaines_recherche.split(',').map((domain: string, i: number) => (
                                      <Badge key={i} variant="outline" className="text-xs">
                                        {domain.trim()}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {result.mots_cles_specifiques && (
                                <div className="mb-2">
                                  <p className="text-sm font-medium mb-1">Keywords:</p>
                                  <div className="flex flex-wrap gap-1">
                                    {result.mots_cles_specifiques.split(',').map((keyword: string, i: number) => (
                                      <Badge key={i} variant="outline" className="text-xs">
                                        {keyword.trim()}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {result.match_reason && (
                                <div className="mt-2 p-2 bg-blue-50 rounded text-sm">
                                  <p className="font-medium text-blue-800">Why this researcher matches:</p>
                                  <p className="text-blue-700">{result.match_reason}</p>
                                </div>
                              )}
                            </div>
                            <div className="flex space-x-2 ml-4">
                              {result.orcid_id && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setCurrentORCIDId(result.orcid_id)
                                    setCurrentResearcherName(`${result.prenom} ${result.nom}`)
                                    setIsSimilaritySearchOpen(false)
                                    setIsORCIDProfileOpen(true)
                                    loadORCIDProfile(result.orcid_id)
                                  }}
                                >
                                  <ExternalLink className="h-4 w-4 mr-1" />
                                  ORCID
                                </Button>
                              )}
                              <Button
                                size="sm"
                                onClick={() => {
                                  const researcher = researchers.find(r => r.id === result.id)
                                  if (researcher) {
                                    setSelectedResearcher(researcher)
                                    setIsSimilaritySearchOpen(false)
                                    setIsViewDialogOpen(true)
                                  }
                                }}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Button>
                            </div>
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </AuthGuard>
  )
}
