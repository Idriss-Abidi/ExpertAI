"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  Users, 
  UserPlus, 
  UserCheck, 
  UserX, 
  Shield, 
  ShieldOff, 
  Search,
  Filter,
  Calendar,
  Mail,
  Phone,
  Key,
  Database,
  Settings,
  Trash2,
  RefreshCw,
  Eye,
  Plus,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import AuthGuard from "@/components/AuthGuard"
import { getUsers, createUser, User, UserCreate, toggleUserStatus, toggleUserAdmin } from "@/services/userService"
import { toast } from "@/hooks/use-toast"
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









export default function AdminPage() {
  const { user } = useAuth()
    
    // User Management State
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all")
  const [filterRole, setFilterRole] = useState<"all" | "admin" | "user">("all")
  const [message, setMessage] = useState("")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [newUser, setNewUser] = useState<UserCreate>({
    nom: "",
    prenom: "",
    email: "",
    mot_de_passe: "",
    telephone: "",
    est_admin: false,
    est_actif: true
  })

  // API Configuration State
  const [activeTab, setActiveTab] = useState("users")
  
  // API Keys State
  const [apiKeys, setApiKeys] = useState<ApiKeys | null>(null)
  const [apiKeysLoading, setApiKeysLoading] = useState(false)
  const [isCreateApiKeyDialogOpen, setIsCreateApiKeyDialogOpen] = useState(false)
  const [isEditApiKeyDialogOpen, setIsEditApiKeyDialogOpen] = useState(false)
  const [editingApiKey, setEditingApiKey] = useState<ApiKeys | null>(null)
  const [newApiKey, setNewApiKey] = useState<ApiKeyUpdate>({
    cle_openai: "",
    cle_gemini: "",
    cle_deepseek: ""
  })

  // Database Management State
  const [databases, setDatabases] = useState<DatabaseConfig[]>([])
  const [databasesLoading, setDatabasesLoading] = useState(false)
  const [isCreateDatabaseDialogOpen, setIsCreateDatabaseDialogOpen] = useState(false)
  const [newDatabase, setNewDatabase] = useState<DatabaseConfigCreate>({
    id_user: 1,
    conn_name: "",
    dbName: "",
    type: "postgres",
    host: "",
    port: 5432,
    username: "",
    pw: "",
    schema: "public"
  })
  const [schemaModalOpen, setSchemaModalOpen] = useState(false)
  const [schemaData, setSchemaData] = useState<any>(null)
  const [selectedSchemaDatabase, setSelectedSchemaDatabase] = useState<string>("")

  useEffect(() => {
    fetchUsers()
    fetchApiKeys()
    fetchDatabases()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const usersData = await getUsers()
      setUsers(usersData)
    } catch (error) {
      console.error("Error fetching users:", error)
      setMessage("Failed to fetch users")
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async () => {
    try {
      await createUser(newUser)
      setMessage("User created successfully!")
      setIsCreateDialogOpen(false)
      setNewUser({
        nom: "",
        prenom: "",
        email: "",
        mot_de_passe: "",
        telephone: "",
        est_admin: false,
        est_actif: true
      })
      fetchUsers() // Refresh the list
    } catch (error: any) {
      setMessage(error.response?.data?.detail || "Failed to create user")
    }
  }

  const handleToggleStatus = async (userId: number, currentStatus: boolean) => {
    try {
      await toggleUserStatus(userId, !currentStatus)
      setMessage(`User ${currentStatus ? 'deactivated' : 'activated'} successfully!`)
      fetchUsers() // Refresh the list
    } catch (error: any) {
      setMessage(error.response?.data?.detail || "Failed to update user status")
    }
  }

  const handleToggleAdmin = async (userId: number, currentAdminStatus: boolean) => {
    try {
      await toggleUserAdmin(userId, !currentAdminStatus)
      setMessage(`User ${currentAdminStatus ? 'removed from' : 'promoted to'} admin successfully!`)
      fetchUsers() // Refresh the list
    } catch (error: any) {
      setMessage(error.response?.data?.detail || "Failed to update admin status")
    }
  }

  // API Keys Management Functions
  const fetchApiKeys = async () => {
    try {
      setApiKeysLoading(true)
      const keys = await apiKeyService.getApiKeys(1)
      setApiKeys(keys)
    } catch (error) {
      console.error("Error fetching API keys:", error)
      toast({
        title: "Error",
        description: "Failed to fetch API keys",
        variant: "destructive",
      })
    } finally {
      setApiKeysLoading(false)
    }
  }

  const handleCreateApiKey = async () => {
    try {
      await apiKeyService.createApiKeys({
        utilisateur_id: 1,
        ...newApiKey
      })
      toast({
        title: "Success",
        description: "API keys created successfully!",
      })
      setIsCreateApiKeyDialogOpen(false)
      setNewApiKey({
        cle_openai: "",
        cle_gemini: "",
        cle_deepseek: ""
      })
      fetchApiKeys()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to create API keys",
        variant: "destructive",
      })
    }
  }

  const handleUpdateApiKey = async () => {
    if (!editingApiKey) return
    try {
      await apiKeyService.updateApiKeys(1, editingApiKey)
      toast({
        title: "Success",
        description: "API keys updated successfully!",
      })
      setIsEditApiKeyDialogOpen(false)
      setEditingApiKey(null)
      fetchApiKeys()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to update API keys",
        variant: "destructive",
      })
    }
  }

  const handleDeleteApiKey = async () => {
    try {
      await apiKeyService.deleteApiKeys(1)
      toast({
        title: "Success",
        description: "API keys deleted successfully!",
      })
      fetchApiKeys()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete API keys",
        variant: "destructive",
      })
    }
  }

  // Database Management Functions
  const fetchDatabases = async () => {
    try {
      setDatabasesLoading(true)
      const configs = await getDatabases()
      setDatabases(configs)
    } catch (error) {
      console.error("Error fetching databases:", error)
      toast({
        title: "Error",
        description: "Failed to fetch database connections",
        variant: "destructive",
      })
    } finally {
      setDatabasesLoading(false)
    }
  }

  const handleCreateDatabase = async () => {
    try {
      await createDatabase(newDatabase)
      toast({
        title: "Success",
        description: "Database connection created successfully!",
      })
      setIsCreateDatabaseDialogOpen(false)
      setNewDatabase({
        id_user: 1,
        conn_name: "",
        dbName: "",
        type: "postgres",
        host: "",
        port: 5432,
        username: "",
        pw: "",
        schema: "public"
      })
      fetchDatabases()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to create database connection",
        variant: "destructive",
      })
    }
  }

  const handleTestDatabaseConnection = async (dbId: number) => {
    try {
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
      fetchDatabases()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to test database connection",
        variant: "destructive",
      })
    }
  }

  const handleDeleteDatabase = async (dbId: number) => {
    try {
      if (!window.confirm("Are you sure you want to delete this database connection? This action cannot be undone.")) {
        return
      }
      await deleteDatabase(dbId)
      toast({
        title: "Success",
        description: "Database connection deleted successfully!",
      })
      fetchDatabases()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete database connection",
        variant: "destructive",
      })
    }
  }

  const handleLoadSchema = async (dbId: number) => {
    try {
      const response = await getDatabaseSchema(dbId.toString())
      setSchemaData(response.schema)
      setSelectedSchemaDatabase(databases.find(db => db.id === dbId)?.conn_name || `Database ${dbId}`)
      setSchemaModalOpen(true)
      toast({
        title: "Success",
        description: "Database schema loaded successfully!",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to load database schema",
        variant: "destructive",
      })
    }
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.prenom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = filterStatus === "all" || 
      (filterStatus === "active" && user.est_actif) ||
      (filterStatus === "inactive" && !user.est_actif)
    
    const matchesRole = filterRole === "all" ||
      (filterRole === "admin" && user.est_admin) ||
      (filterRole === "user" && !user.est_admin)
    
    return matchesSearch && matchesStatus && matchesRole
  })

  const stats = {
    total: users.length,
    active: users.filter(u => u.est_actif).length,
    inactive: users.filter(u => !u.est_actif).length,
    admins: users.filter(u => u.est_admin).length,
    regular: users.filter(u => !u.est_admin).length
  }

  return (
    <AuthGuard requireAdmin={true}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage users, API keys, and database connections</p>
        </div>

                 {/* Main Tabs */}
         <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
           <TabsList className="grid w-full grid-cols-3">
             <TabsTrigger value="users">User Management</TabsTrigger>
             <TabsTrigger value="api-config">API Configuration</TabsTrigger>
             <TabsTrigger value="database">Database Management</TabsTrigger>
           </TabsList>

          {/* User Management Tab */}
          <TabsContent value="users">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">User Management</h2>
                  <p className="text-muted-foreground">Manage users, roles, and account status</p>
                </div>
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add User
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Create New User</DialogTitle>
                      <DialogDescription>
                        Add a new user to the system. Fill in the required information.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="firstName">First Name</Label>
                          <Input
                            id="firstName"
                            value={newUser.prenom}
                            onChange={(e) => setNewUser(prev => ({ ...prev, prenom: e.target.value }))}
                            placeholder="John"
                          />
                        </div>
                        <div>
                          <Label htmlFor="lastName">Last Name</Label>
                          <Input
                            id="lastName"
                            value={newUser.nom}
                            onChange={(e) => setNewUser(prev => ({ ...prev, nom: e.target.value }))}
                            placeholder="Doe"
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={newUser.email}
                          onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="john.doe@example.com"
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          value={newUser.telephone || ""}
                          onChange={(e) => setNewUser(prev => ({ ...prev, telephone: e.target.value }))}
                          placeholder="+1234567890"
                        />
                      </div>
                      <div>
                        <Label htmlFor="password">Password</Label>
                        <Input
                          id="password"
                          type="password"
                          value={newUser.mot_de_passe}
                          onChange={(e) => setNewUser(prev => ({ ...prev, mot_de_passe: e.target.value }))}
                          placeholder="Enter password"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="isAdmin"
                          checked={newUser.est_admin}
                          onChange={(e) => setNewUser(prev => ({ ...prev, est_admin: e.target.checked }))}
                          className="rounded"
                        />
                        <Label htmlFor="isAdmin">Admin privileges</Label>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreateUser}>
                        Create User
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {message && (
                <Alert>
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              )}

              {/* Stats Cards */}
              <div className="grid gap-4 md:grid-cols-5">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.total}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active</CardTitle>
                    <UserCheck className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{stats.active}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Inactive</CardTitle>
                    <UserX className="h-4 w-4 text-red-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{stats.inactive}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Admins</CardTitle>
                    <Shield className="h-4 w-4 text-purple-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-600">{stats.admins}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Regular Users</CardTitle>
                    <Users className="h-4 w-4 text-blue-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">{stats.regular}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Filters */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Filter className="mr-2 h-5 w-5" />
                    Filters
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[200px]">
                      <Label htmlFor="search">Search</Label>
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="search"
                          placeholder="Search by name or email..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-8"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="status">Status</Label>
                      <select
                        id="status"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as any)}
                        className="w-full p-2 border rounded-md"
                      >
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="role">Role</Label>
                      <select
                        id="role"
                        value={filterRole}
                        onChange={(e) => setFilterRole(e.target.value as any)}
                        className="w-full p-2 border rounded-md"
                      >
                        <option value="all">All Roles</option>
                        <option value="admin">Admins</option>
                        <option value="user">Users</option>
                      </select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Users Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Users ({filteredUsers.length})</CardTitle>
                  <CardDescription>Manage user accounts and permissions</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-muted-foreground">Loading users...</div>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((userItem) => (
                          <TableRow key={userItem.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{userItem.prenom} {userItem.nom}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center">
                                <Mail className="mr-2 h-4 w-4 text-muted-foreground" />
                                {userItem.email}
                              </div>
                            </TableCell>
                            <TableCell>
                              {userItem.telephone ? (
                                <div className="flex items-center">
                                  <Phone className="mr-2 h-4 w-4 text-muted-foreground" />
                                  {userItem.telephone}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={userItem.est_actif ? "default" : "secondary"}>
                                {userItem.est_actif ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={userItem.est_admin ? "destructive" : "outline"}>
                                {userItem.est_admin ? "Admin" : "User"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center">
                                <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                                {new Date(userItem.date_creation).toLocaleDateString()}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex space-x-2">
                                <Button
                                  size="sm"
                                  variant={userItem.est_actif ? "destructive" : "default"}
                                  onClick={() => handleToggleStatus(userItem.id, userItem.est_actif)}
                                  disabled={userItem.id === user?.id} // Can't deactivate yourself
                                >
                                  {userItem.est_actif ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                                </Button>
                                <Button
                                  size="sm"
                                  variant={userItem.est_admin ? "outline" : "default"}
                                  onClick={() => handleToggleAdmin(userItem.id, userItem.est_admin)}
                                  disabled={userItem.id === user?.id} // Can't remove admin from yourself
                                >
                                  {userItem.est_admin ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* API Configuration Tab */}
          <TabsContent value="api-config">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">API Configuration</h2>
                  <p className="text-muted-foreground">Manage API keys for external services</p>
                </div>
                <Dialog open={isCreateApiKeyDialogOpen} onOpenChange={setIsCreateApiKeyDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Add API Keys
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Create API Keys</DialogTitle>
                      <DialogDescription>
                        Add API keys for external services. Leave empty if not needed.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div>
                        <Label htmlFor="openai">OpenAI API Key</Label>
                        <Input
                          id="openai"
                          type="password"
                          value={newApiKey.cle_openai || ""}
                          onChange={(e) => setNewApiKey(prev => ({ ...prev, cle_openai: e.target.value }))}
                          placeholder="sk-..."
                        />
                      </div>
                      <div>
                        <Label htmlFor="gemini">Google Gemini API Key</Label>
                        <Input
                          id="gemini"
                          type="password"
                          value={newApiKey.cle_gemini || ""}
                          onChange={(e) => setNewApiKey(prev => ({ ...prev, cle_gemini: e.target.value }))}
                          placeholder="AIza..."
                        />
                      </div>
                      <div>
                        <Label htmlFor="deepseek">DeepSeek API Key</Label>
                        <Input
                          id="deepseek"
                          type="password"
                          value={newApiKey.cle_deepseek || ""}
                          onChange={(e) => setNewApiKey(prev => ({ ...prev, cle_deepseek: e.target.value }))}
                          placeholder="sk-..."
                        />
                      </div>

                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCreateApiKeyDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreateApiKey}>
                        Create API Keys
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {/* API Keys Display */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Key className="mr-2 h-5 w-5" />
                    Current API Keys
                  </CardTitle>
                  <CardDescription>View and manage your API keys</CardDescription>
                </CardHeader>
                <CardContent>
                  {apiKeysLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span className="ml-2">Loading API keys...</span>
                    </div>
                  ) : apiKeys ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium text-blue-600">OpenAI API Key</h4>
                              <p className="text-sm text-muted-foreground">Used for GPT models</p>
                            </div>
                            <div className="flex items-center space-x-2">
                              <code className="text-sm bg-muted px-2 py-1 rounded">
                                {apiKeys.cle_openai ? `${apiKeys.cle_openai.substring(0, 8)}...` : 'Not set'}
                              </code>
                            </div>
                          </div>
                        </div>

                        <div className="border rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium text-purple-600">Google Gemini API Key</h4>
                              <p className="text-sm text-muted-foreground">Used for Gemini models</p>
                            </div>
                            <div className="flex items-center space-x-2">
                              <code className="text-sm bg-muted px-2 py-1 rounded">
                                {apiKeys.cle_gemini ? `${apiKeys.cle_gemini.substring(0, 8)}...` : 'Not set'}
                              </code>
                            </div>
                          </div>
                        </div>

                        <div className="border rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium text-green-600">DeepSeek API Key</h4>
                              <p className="text-sm text-muted-foreground">Used for DeepSeek models</p>
                            </div>
                            <div className="flex items-center space-x-2">
                              <code className="text-sm bg-muted px-2 py-1 rounded">
                                {apiKeys.cle_deepseek ? `${apiKeys.cle_deepseek.substring(0, 8)}...` : 'Not set'}
                              </code>
                            </div>
                          </div>
                        </div>


                      </div>

                      <div className="flex space-x-2 pt-4">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingApiKey(apiKeys)
                            setIsEditApiKeyDialogOpen(true)
                          }}
                        >
                          <Settings className="mr-2 h-4 w-4" />
                          Edit API Keys
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={handleDeleteApiKey}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete All API Keys
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                      <p className="text-muted-foreground">No API keys found</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Edit API Keys Dialog */}
            <Dialog open={isEditApiKeyDialogOpen} onOpenChange={setIsEditApiKeyDialogOpen}>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Edit API Keys</DialogTitle>
                  <DialogDescription>
                    Update your API keys. Leave empty to keep current values.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div>
                    <Label htmlFor="edit-openai">OpenAI API Key</Label>
                    <Input
                      id="edit-openai"
                      type="password"
                      value={editingApiKey?.cle_openai || ""}
                      onChange={(e) => setEditingApiKey(prev => prev ? { ...prev, cle_openai: e.target.value } : null)}
                      placeholder="sk-..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-gemini">Google Gemini API Key</Label>
                    <Input
                      id="edit-gemini"
                      type="password"
                      value={editingApiKey?.cle_gemini || ""}
                      onChange={(e) => setEditingApiKey(prev => prev ? { ...prev, cle_gemini: e.target.value } : null)}
                      placeholder="AIza..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-deepseek">DeepSeek API Key</Label>
                    <Input
                      id="edit-deepseek"
                      type="password"
                      value={editingApiKey?.cle_deepseek || ""}
                      onChange={(e) => setEditingApiKey(prev => prev ? { ...prev, cle_deepseek: e.target.value } : null)}
                      placeholder="sk-..."
                    />
                  </div>

                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsEditApiKeyDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleUpdateApiKey}>
                    Update API Keys
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Database Management Tab */}
          <TabsContent value="database">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Database Management</h2>
                  <p className="text-muted-foreground">Manage database connections and schemas</p>
                </div>
                <Dialog open={isCreateDatabaseDialogOpen} onOpenChange={setIsCreateDatabaseDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Database
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Create Database Connection</DialogTitle>
                      <DialogDescription>
                        Add a new database connection to the system.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="conn-name">Connection Name</Label>
                          <Input
                            id="conn-name"
                            value={newDatabase.conn_name}
                            onChange={(e) => setNewDatabase(prev => ({ ...prev, conn_name: e.target.value }))}
                            placeholder="My Database"
                          />
                        </div>
                        <div>
                          <Label htmlFor="db-name">Database Name</Label>
                          <Input
                            id="db-name"
                            value={newDatabase.dbName}
                            onChange={(e) => setNewDatabase(prev => ({ ...prev, dbName: e.target.value }))}
                            placeholder="mydb"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="db-type">Database Type</Label>
                          <Select value={newDatabase.type} onValueChange={(value) => setNewDatabase(prev => ({ ...prev, type: value }))}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select database type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="postgres">PostgreSQL</SelectItem>
                              <SelectItem value="mysql">MySQL</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="schema">Schema</Label>
                          <Input
                            id="schema"
                            value={newDatabase.schema || ""}
                            onChange={(e) => setNewDatabase(prev => ({ ...prev, schema: e.target.value }))}
                            placeholder="public"
                            disabled={newDatabase.type === "mysql"}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="host">Host</Label>
                          <Input
                            id="host"
                            value={newDatabase.host}
                            onChange={(e) => setNewDatabase(prev => ({ ...prev, host: e.target.value }))}
                            placeholder="host.docker.internal"
                          />
                        </div>
                        <div>
                          <Label htmlFor="port">Port</Label>
                          <Input
                            id="port"
                            type="number"
                            value={newDatabase.port}
                            onChange={(e) => setNewDatabase(prev => ({ ...prev, port: parseInt(e.target.value) }))}
                            placeholder="5432"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="username">Username</Label>
                          <Input
                            id="username"
                            value={newDatabase.username}
                            onChange={(e) => setNewDatabase(prev => ({ ...prev, username: e.target.value }))}
                            placeholder="postgres"
                          />
                        </div>
                        <div>
                          <Label htmlFor="password">Password</Label>
                          <Input
                            id="password"
                            type="password"
                            value={newDatabase.pw}
                            onChange={(e) => setNewDatabase(prev => ({ ...prev, pw: e.target.value }))}
                            placeholder="Enter password"
                          />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCreateDatabaseDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreateDatabase}>
                        Create Database
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Connected Databases */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Database className="mr-2 h-5 w-5" />
                      Connected Databases
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchDatabases}
                      disabled={databasesLoading}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${databasesLoading ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </CardTitle>
                  <CardDescription>Manage your database connections</CardDescription>
                </CardHeader>
                <CardContent>
                  {databasesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span className="ml-2">Loading databases...</span>
                    </div>
                  ) : databases.length > 0 ? (
                    <div className="space-y-4">
                      {databases.map((db) => (
                        <div key={db.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <h4 className="font-medium">{db.conn_name}</h4>
                                <Badge variant={db.status === "connected" ? "default" : "secondary"}>
                                  {db.status || "unknown"}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {db.type} • {db.host}:{db.port} • {db.dbName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                User: {db.username}
                              </p>
                            </div>
                            <div className="flex space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleLoadSchema(db.id)}
                                title="Show Schema"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteDatabase(db.id)}
                                title="Delete Database"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No database connections found</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Schema Modal */}
            <Dialog open={schemaModalOpen} onOpenChange={setSchemaModalOpen}>
              <DialogContent className="max-w-4xl max-h-[600px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center space-x-2">
                    <Database className="h-5 w-5" />
                    <span>Database Schema: {selectedSchemaDatabase}</span>
                  </DialogTitle>
                  <DialogDescription>
                    Tables, columns, and data types for this database connection
                  </DialogDescription>
                </DialogHeader>
                <div className="max-h-[500px] overflow-y-auto">
                  {schemaData ? (
                    <pre className="text-xs bg-muted p-4 rounded overflow-x-auto">
                      {JSON.stringify(schemaData, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground">No schema data available</p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>
        </Tabs>

                 
       </div>
     </AuthGuard>
   )
 }
