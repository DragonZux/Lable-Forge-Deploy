"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, Button, Input, Tabs, Modal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { apiPatch, apiDelete, api } from "@/lib/api";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { User, Shield, AlertTriangle, Mail, Camera, Upload } from "lucide-react";
import { motion } from "framer-motion";

interface ProfileForm {
  full_name: string;
  avatar_url?: string;
}

interface PasswordForm {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export default function SettingsPage() {
  const { user, logout, refetchUser } = useAuth();
  const toast = useToast();
  const [, setActiveTab] = useState("profile");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile form
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    full_name: "",
    avatar_url: "",
  });

  // Sync profile form with user data when user changes
  useEffect(() => {
    if (user) {
      setProfileForm({
        full_name: user.full_name || "",
        avatar_url: user.avatar_url || "",
      });
    }
  }, [user]);

  // Password form
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Avatar size must be less than 5MB");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setIsUploadingAvatar(true);
    try {
      await api.post("/settings/avatar", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      await refetchUser();
      toast.success("Avatar updated successfully");
    } catch (error: any) {
      toast.error(error?.detail || error?.message || "Failed to upload avatar");
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleUpdateProfile = async () => {
    if (!profileForm.full_name.trim()) {
      toast.error("Full name is required");
      return;
    }

    setIsLoading(true);
    try {
      await apiPatch("/settings/profile", {
        full_name: profileForm.full_name,
        avatar_url: profileForm.avatar_url || undefined,
      });
      await refetchUser();
      toast.success("Profile updated successfully");
    } catch (error: any) {
      toast.error(error?.detail || "Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error("New passwords do not match");
      return;
    }

    if (passwordForm.new_password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);
    try {
      await apiPatch("/settings/password", {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      toast.success("Password changed successfully");
      setPasswordForm({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
    } catch (error: any) {
      toast.error(error?.detail || "Failed to change password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteEmail !== user?.email) {
      toast.error("Email does not match");
      return;
    }

    setIsLoading(true);
    try {
      await apiDelete("/settings/account", {
        email: deleteEmail,
      });
      toast.success("Account deleted successfully");
      logout();
    } catch (error: any) {
      toast.error(error?.detail || "Failed to delete account");
    } finally {
      setIsLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!user) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const tabs = [
    {
      id: "profile",
      label: (
        <div className="flex items-center gap-2">
          <User className="w-4 h-4" />
          <span>Profile</span>
        </div>
      ),
      content: (
        <div className="space-y-6 pt-4">
          <div className="flex items-center gap-6 mb-8">
            <div 
              className="relative group w-20 h-20 shrink-0 cursor-pointer overflow-hidden rounded-3xl"
              onClick={handleAvatarClick}
            >
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.full_name}
                  className="w-20 h-20 rounded-3xl object-cover shadow-accent border-2 border-accent/20 group-hover:border-accent transition-all duration-300"
                />
              ) : (
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center text-white text-3xl font-display shadow-accent border-2 border-transparent group-hover:border-accent transition-all duration-300">
                  {user.full_name?.charAt(0) || "U"}
                </div>
              )}
              {/* Overlay hover effect */}
              <div className="absolute inset-0 bg-black/40 rounded-3xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300 backdrop-blur-[2px]">
                <Camera className="w-6 h-6 text-white" />
              </div>
              
              {isUploadingAvatar && (
                <div className="absolute inset-0 bg-black/60 rounded-3xl flex items-center justify-center backdrop-blur-[2px]">
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </div>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAvatarUpload}
              accept="image/jpeg,image/png,image/bmp,image/webp"
              className="hidden"
            />
            
            <div>
              <h3 className="text-xl font-bold text-foreground">{user.full_name}</h3>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              
              <div className="mt-2 flex items-center gap-3">
                <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                  <Shield className="w-3 h-3" />
                  Verified Account
                </div>
                
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  disabled={isUploadingAvatar}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-accent hover:text-accent-secondary hover:bg-accent/5 rounded-lg transition-colors border border-accent/10 hover:border-accent/20"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload New
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">
                Full Name
              </label>
              <Input
                value={profileForm.full_name}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    full_name: e.target.value,
                  })
                }
                placeholder="Your full name"
                className="h-12 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">
                Avatar URL
              </label>
              <Input
                value={profileForm.avatar_url}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    avatar_url: e.target.value,
                  })
                }
                placeholder="https://example.com/avatar.jpg"
                type="url"
                className="h-12 rounded-xl"
              />
            </div>
          </div>

          <div className="pt-4">
            <Button 
              onClick={handleUpdateProfile} 
              isLoading={isLoading}
              className="h-12 px-8 rounded-xl shadow-accent"
            >
              Save Profile
            </Button>
          </div>
        </div>
      ),
    },
    {
      id: "security",
      label: (
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4" />
          <span>Security</span>
        </div>
      ),
      content: (
        <div className="space-y-6 pt-4">
          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">
                Current Password
              </label>
              <Input
                type="password"
                value={passwordForm.current_password}
                onChange={(e) =>
                  setPasswordForm({
                    ...passwordForm,
                    current_password: e.target.value,
                  })
                }
                placeholder="Enter current password"
                className="h-12 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">
                New Password
              </label>
              <Input
                type="password"
                value={passwordForm.new_password}
                onChange={(e) =>
                  setPasswordForm({
                    ...passwordForm,
                    new_password: e.target.value,
                  })
                }
                placeholder="Minimum 8 characters"
                className="h-12 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">
                Confirm New Password
              </label>
              <Input
                type="password"
                value={passwordForm.confirm_password}
                onChange={(e) =>
                  setPasswordForm({
                    ...passwordForm,
                    confirm_password: e.target.value,
                  })
                }
                placeholder="Confirm your new password"
                className="h-12 rounded-xl"
              />
            </div>
          </div>

          <div className="pt-4">
            <Button 
              onClick={handleChangePassword} 
              isLoading={isLoading}
              className="h-12 px-8 rounded-xl shadow-accent"
            >
              Update Password
            </Button>
          </div>
        </div>
      ),
    },
    {
      id: "danger",
      label: (
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>Danger</span>
        </div>
      ),
      content: (
        <div className="space-y-4 pt-4">
          <div className="rounded-2xl border border-red-100 bg-red-50/50 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center text-red-600 flex-shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-900 mb-2">Delete Account</h3>
                <p className="text-sm text-red-700/70 mb-6 leading-relaxed">
                  Permanently delete your account and all associated data including projects, datasets, and models. This action is irreversible.
                </p>
                <Button
                  variant="danger"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="h-11 px-6 rounded-xl shadow-lg shadow-red-200"
                >
                  Delete Permanently
                </Button>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="page-shell max-w-3xl">
      <div className="page-hero mb-10">
        <div className="relative z-10">
          <SectionLabel label="Account Control" className="mb-4" />
          <h1 className="page-title">
            System <span className="gradient-text">Settings</span>
          </h1>
          <p className="page-subtitle mt-3">
            Configure your personal profile and security preferences.
          </p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="panel overflow-hidden p-6 sm:p-8">
          <Tabs tabs={tabs} defaultTab="profile" onChange={setActiveTab} />
        </Card>
      </motion.div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Account Deletion"
        size="md"
      >
        <div className="space-y-6">
          <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-xs font-medium text-amber-800 leading-relaxed">
              This will erase all your records from LabelForge. There is no way to recover your data once confirmed.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
              Confirm by typing your email
            </label>
            <div className="relative">
              <Input
                value={deleteEmail}
                onChange={(e) => setDeleteEmail(e.target.value)}
                placeholder={user.email}
                type="email"
                className="h-12 pl-12 rounded-xl"
              />
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-border">
            <Button
              variant="secondary"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isLoading}
              className="px-6 h-11 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteAccount}
              isLoading={isLoading}
              disabled={deleteEmail !== user.email}
              className="px-8 h-11 rounded-xl shadow-lg shadow-red-200"
            >
              Confirm Deletion
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
