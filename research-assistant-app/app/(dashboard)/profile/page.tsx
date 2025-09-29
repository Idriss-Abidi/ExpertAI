"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useRouter } from "next/navigation"
import AuthGuard from "@/components/AuthGuard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Mail, Phone, Save, Edit, Lock, Eye, EyeOff, Loader2 } from "lucide-react"

import { changePassword, getCurrentUser, updateProfile, type User } from "@/services/userService"

interface UserProfile {
  nom: string
  prenom: string
  email: string
  telephone: string
}

export default function ProfilePage() {
  const { user: authUser } = useAuth()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile>({
    nom: "",
    prenom: "",
    email: "",
    telephone: "",
  })
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [passwordData, setPasswordData] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: ""
  })
  const [passwordMessage, setPasswordMessage] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true)
        const userData = await getCurrentUser()
        setUser(userData)
        setProfile({
          nom: userData.nom || "",
          prenom: userData.prenom || "",
          email: userData.email || "",
          telephone: userData.telephone || "",
        })
      } catch (error) {
        console.error("Failed to fetch user data:", error)
      } finally {
        setLoading(false)
      }
    }

    if (authUser) {
      fetchUserData()
    }
  }, [authUser])

  const handleInputChange = (field: keyof UserProfile, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveMessage("")

    try {
      const updatedUser = await updateProfile({
        nom: profile.nom,
        prenom: profile.prenom,
        email: profile.email,
        telephone: profile.telephone
      })
      
      // Update the user state with the new data
      setUser(updatedUser)
      
      setIsEditing(false)
      setSaveMessage("Profile updated successfully!")

      // Clear message after 3 seconds
      setTimeout(() => setSaveMessage(""), 3000)
    } catch (error: any) {
      setSaveMessage(error.response?.data?.detail || "Failed to update profile")
    } finally {
      setIsSaving(false)
    }
  }

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordMessage("New passwords do not match")
      return
    }

    if (passwordData.newPassword.length < 6) {
      setPasswordMessage("New password must be at least 6 characters long")
      return
    }

    setIsChangingPassword(true)
    setPasswordMessage("")

    try {
      await changePassword({
        old_password: passwordData.oldPassword,
        new_password: passwordData.newPassword
      })
      
      setPasswordMessage("Password changed successfully!")
      setPasswordData({ oldPassword: "", newPassword: "", confirmPassword: "" })
      
      // Clear message after 3 seconds
      setTimeout(() => setPasswordMessage(""), 3000)
    } catch (error: any) {
      setPasswordMessage(error.response?.data?.detail || "Failed to change password")
    } finally {
      setIsChangingPassword(false)
    }
  }

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  }

  if (loading) {
    return (
      <AuthGuard>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Loading profile...</span>
          </div>
        </div>
      </AuthGuard>
    )
  }

  if (!user) {
    return (
      <AuthGuard>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-muted-foreground">Failed to load user profile</p>
          </div>
        </div>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
            <p className="text-muted-foreground">Manage your personal information</p>
          </div>
          <Button onClick={() => (isEditing ? handleSave() : setIsEditing(true))} disabled={isSaving}>
            {isEditing ? (
              <>
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : "Save Changes"}
              </>
            ) : (
              <>
                <Edit className="mr-2 h-4 w-4" />
                Edit Profile
              </>
            )}
          </Button>
        </div>

        {saveMessage && (
          <Alert>
            <AlertDescription>{saveMessage}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          {/* Profile Overview */}
          <div className="md:col-span-1">
            <Card>
              <CardHeader className="text-center">
                <Avatar className="w-24 h-24 mx-auto mb-4">
                  <AvatarImage src="/placeholder.svg?height=96&width=96" alt="Profile" />
                  <AvatarFallback className="text-2xl">{getInitials(profile.prenom, profile.nom)}</AvatarFallback>
                </Avatar>
                <CardTitle className="text-xl">
                  {profile.prenom} {profile.nom}
                </CardTitle>
                <div className="flex justify-center mt-2 space-x-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    user?.est_admin 
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                      : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  }`}>
                    {user?.est_admin ? 'Administrator' : 'User'}
                  </span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    user?.est_actif 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }`}>
                    {user?.est_actif ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{profile.email}</span>
                </div>
                {profile.telephone && (
                  <div className="flex items-center space-x-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{profile.telephone}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Profile Details */}
          <div className="md:col-span-2 space-y-6">
            {/* Personal Information */}
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>{isEditing ? "Edit your personal details" : "Your personal details"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="prenom">First Name</Label>
                    <Input
                      id="prenom"
                      value={profile.prenom}
                      onChange={(e) => handleInputChange("prenom", e.target.value)}
                      disabled={!isEditing}
                    />
                  </div>
                  <div>
                    <Label htmlFor="nom">Last Name</Label>
                    <Input
                      id="nom"
                      value={profile.nom}
                      onChange={(e) => handleInputChange("nom", e.target.value)}
                      disabled={!isEditing}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profile.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    disabled={!isEditing}
                  />
                </div>

                <div>
                  <Label htmlFor="telephone">Phone</Label>
                  <Input
                    id="telephone"
                    value={profile.telephone}
                    onChange={(e) => handleInputChange("telephone", e.target.value)}
                    disabled={!isEditing}
                    placeholder="Enter phone number"
                  />
                </div>

                {isEditing && (
                  <div className="flex justify-end space-x-2 pt-4">
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        // Reset form to original values
                        setProfile({
                          nom: user.nom || "",
                          prenom: user.prenom || "",
                          email: user.email || "",
                          telephone: user.telephone || "",
                        })
                        setIsEditing(false)
                      }} 
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Password Change */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Lock className="h-5 w-5 mr-2" />
                  Change Password
                </CardTitle>
                <CardDescription>Update your account password</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {passwordMessage && (
                  <Alert variant={passwordMessage.includes("successfully") ? "default" : "destructive"}>
                    <AlertDescription>{passwordMessage}</AlertDescription>
                  </Alert>
                )}

                <div>
                  <Label htmlFor="oldPassword">Current Password</Label>
                  <Input
                    id="oldPassword"
                    type="password"
                    value={passwordData.oldPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, oldPassword: e.target.value }))}
                    placeholder="Enter your current password"
                  />
                </div>

                <div>
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                      placeholder="Enter your new password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="Confirm your new password"
                  />
                </div>

                <div className="flex justify-end">
                  <Button 
                    onClick={handlePasswordChange} 
                    disabled={isChangingPassword || !passwordData.oldPassword || !passwordData.newPassword || !passwordData.confirmPassword}
                  >
                    {isChangingPassword ? "Changing Password..." : "Change Password"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
