"use client";

import * as React from "react";
import { motion, Reorder, AnimatePresence } from "framer-motion";
import { Grip, X, Plus, Merge, Loader2, Edit2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import Image from "next/image";

// ============================================================
// Bulk Photo Grouping Step
// Review and adjust AI-suggested photo groups with drag & drop
// ============================================================

interface PhotoData {
  id: string;
  url: string;
  cardUrl: string;
  thumbnailUrl: string;
}

interface PhotoGroup {
  id: string;
  photoIndexes: number[];
  suggestedName: string;
  confidence: number;
}

interface BulkPhotoGroupingStepProps {
  photos: PhotoData[];
  onComplete: (groups: PhotoGroup[]) => void;
  onBack?: () => void;
}

export function BulkPhotoGroupingStep({ photos, onComplete, onBack }: BulkPhotoGroupingStepProps) {
  const [groups, setGroups] = React.useState<PhotoGroup[]>([]);
  const [isAnalysing, setIsAnalysing] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");
  const [isMobile, setIsMobile] = React.useState(false);

  // Detect if on mobile
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Run AI grouping on mount
  React.useEffect(() => {
    analysePhotos();
  }, []);

  const analysePhotos = async () => {
    setIsAnalysing(true);
    setError(null);

    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('You must be logged in');
      }

      // Call AI grouping edge function
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/group-photos-ai`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageUrls: photos.map(p => p.url),
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to analyse photos');
      }

      const data = await response.json();
      console.log('✅ [GROUPING] AI analysis complete:', data);
      setGroups(data.groups);

    } catch (err) {
      console.error('❌ [GROUPING] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyse photos');
      
      // Fallback: Create one group per photo
      const fallbackGroups: PhotoGroup[] = photos.map((_, index) => ({
        id: `group-${index + 1}`,
        photoIndexes: [index],
        suggestedName: `Product ${index + 1}`,
        confidence: 50,
      }));
      setGroups(fallbackGroups);
    } finally {
      setIsAnalysing(false);
    }
  };

  const movePhotoToGroup = (photoIndex: number, fromGroupId: string, toGroupId: string) => {
    setGroups(prev => {
      const newGroups = prev.map(g => ({ ...g, photoIndexes: [...g.photoIndexes] }));
      
      // Remove from old group
      const fromGroup = newGroups.find(g => g.id === fromGroupId);
      if (fromGroup) {
        fromGroup.photoIndexes = fromGroup.photoIndexes.filter(i => i !== photoIndex);
      }
      
      // Add to new group
      const toGroup = newGroups.find(g => g.id === toGroupId);
      if (toGroup) {
        toGroup.photoIndexes.push(photoIndex);
      }
      
      // Remove empty groups
      return newGroups.filter(g => g.photoIndexes.length > 0);
    });
  };

  const removePhotoFromGroup = (photoIndex: number, groupId: string) => {
    setGroups(prev => {
      const newGroups = prev.map(g => ({ ...g, photoIndexes: [...g.photoIndexes] }));
      const group = newGroups.find(g => g.id === groupId);
      
      if (group) {
        group.photoIndexes = group.photoIndexes.filter(i => i !== photoIndex);
      }
      
      // If photo was removed, create a new group for it
      if (!newGroups.some(g => g.photoIndexes.includes(photoIndex))) {
        newGroups.push({
          id: `group-${Date.now()}`,
          photoIndexes: [photoIndex],
          suggestedName: `Product ${newGroups.length + 1}`,
          confidence: 50,
        });
      }
      
      // Remove empty groups
      return newGroups.filter(g => g.photoIndexes.length > 0);
    });
  };

  const createNewGroup = () => {
    const newGroup: PhotoGroup = {
      id: `group-${Date.now()}`,
      photoIndexes: [],
      suggestedName: `Product ${groups.length + 1}`,
      confidence: 100,
    };
    setGroups(prev => [...prev, newGroup]);
  };

  const deleteGroup = (groupId: string) => {
    setGroups(prev => prev.filter(g => g.id !== groupId));
  };

  const mergeGroups = (groupId1: string, groupId2: string) => {
    setGroups(prev => {
      const group1 = prev.find(g => g.id === groupId1);
      const group2 = prev.find(g => g.id === groupId2);
      
      if (!group1 || !group2) return prev;
      
      const merged: PhotoGroup = {
        id: groupId1,
        photoIndexes: [...group1.photoIndexes, ...group2.photoIndexes],
        suggestedName: group1.suggestedName,
        confidence: Math.min(group1.confidence, group2.confidence),
      };
      
      return prev.map(g => g.id === groupId1 ? merged : g).filter(g => g.id !== groupId2);
    });
  };

  const updateGroupName = (groupId: string, name: string) => {
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, suggestedName: name } : g));
  };

  const startEditing = (groupId: string, currentName: string) => {
    setEditingGroupId(groupId);
    setEditingName(currentName);
  };

  const finishEditing = () => {
    if (editingGroupId && editingName.trim()) {
      updateGroupName(editingGroupId, editingName.trim());
    }
    setEditingGroupId(null);
    setEditingName("");
  };

  if (isAnalysing) {
    return (
      <div className="min-h-screen bg-gray-50 pt-20 pb-20 flex items-center justify-center px-4">
        <div className="text-center">
          {/* Animated progress indicator */}
          <div className="relative inline-block mb-6">
            <div className={cn(
              "rounded-full bg-gray-100 flex items-center justify-center",
              isMobile ? "h-16 w-16" : "h-20 w-20"
            )}>
              <Merge className={cn("text-gray-400", isMobile ? "h-7 w-7" : "h-9 w-9")} />
            </div>
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#FFC72C]"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
          </div>
          
          <h3 className={cn("font-semibold text-gray-900 mb-2", isMobile ? "text-base" : "text-lg")}>
            Grouping your photos...
          </h3>
          <p className={cn("text-gray-500", isMobile ? "text-sm" : "text-base")}>
            Yellow Jersey is detecting products
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-24">
      <div className={cn("mx-auto", isMobile ? "px-4" : "max-w-6xl px-4")}>
        {/* Header */}
        <div className={cn("mb-6", isMobile ? "text-center" : "mb-8")}>
          <h1 className={cn("font-bold text-gray-900 mb-2", isMobile ? "text-xl" : "text-3xl")}>
            Review Groups
          </h1>
          <p className={cn("text-gray-500", isMobile ? "text-sm" : "text-base")}>
            {isMobile 
              ? `${groups.length} product${groups.length !== 1 ? 's' : ''} detected`
              : "We've grouped your photos by product. Drag photos to reassign them."
            }
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            <p className="text-sm text-gray-700">
              ⚠️ AI grouping had issues. We've created individual groups.
            </p>
          </div>
        )}

        {/* Groups */}
        <div className={cn("space-y-4", isMobile ? "" : "space-y-6")}>
          {groups.map((group, groupIndex) => (
            <motion.div
              key={group.id}
              layout
              className={cn(
                "bg-white border-2 border-gray-200",
                isMobile ? "rounded-xl p-4" : "rounded-md p-6"
              )}
            >
              {/* Group Header */}
              <div className={cn("flex items-start justify-between mb-3", isMobile ? "gap-2" : "mb-4")}>
                <div className="flex-1 min-w-0">
                  {editingGroupId === group.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') finishEditing();
                          if (e.key === 'Escape') {
                            setEditingGroupId(null);
                            setEditingName("");
                          }
                        }}
                        className={cn("rounded-xl", isMobile ? "h-10 text-sm" : "")}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        onClick={finishEditing}
                        className={cn("rounded-xl", isMobile ? "h-10 w-10 p-0" : "")}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "flex-shrink-0 h-6 w-6 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-bold",
                        isMobile ? "h-5 w-5 text-[10px]" : ""
                      )}>
                        {groupIndex + 1}
                      </span>
                      <h3 className={cn("font-semibold text-gray-900 truncate", isMobile ? "text-base" : "text-lg")}>
                        {group.suggestedName}
                      </h3>
                      <button
                        onClick={() => startEditing(group.id, group.suggestedName)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                      >
                        <Edit2 className={cn("text-gray-400", isMobile ? "h-3.5 w-3.5" : "h-4 w-4")} />
                      </button>
                    </div>
                  )}
                  <p className={cn("text-gray-500 mt-0.5", isMobile ? "text-xs ml-7" : "text-sm")}>
                    {group.photoIndexes.length} photo{group.photoIndexes.length !== 1 ? 's' : ''}
                    {group.confidence < 80 && !isMobile && (
                      <span className="ml-2 text-yellow-600">• Review suggested</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => deleteGroup(group.id)}
                  disabled={groups.length === 1}
                  className={cn(
                    "flex-shrink-0 rounded-lg transition-colors disabled:opacity-30",
                    isMobile 
                      ? "p-2 hover:bg-red-50" 
                      : "px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 border border-gray-200"
                  )}
                >
                  {isMobile ? (
                    <X className="h-4 w-4 text-gray-500" />
                  ) : (
                    <>
                      <X className="h-4 w-4 mr-1 inline" />
                      Delete
                    </>
                  )}
                </button>
              </div>

              {/* Photos Grid */}
              <div className={cn(
                "grid gap-2",
                isMobile ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
              )}>
                {group.photoIndexes.map((photoIndex) => {
                  const photo = photos[photoIndex];
                  return (
                    <div
                      key={photoIndex}
                      className={cn(
                        "relative aspect-square overflow-hidden bg-gray-100 group",
                        isMobile ? "rounded-xl" : "rounded-md cursor-move"
                      )}
                      draggable={!isMobile}
                      onDragStart={(e) => {
                        if (!isMobile) {
                          e.dataTransfer.setData('photoIndex', photoIndex.toString());
                          e.dataTransfer.setData('fromGroupId', group.id);
                        }
                      }}
                    >
                      <Image
                        src={photo.cardUrl || photo.url}
                        alt={`Photo ${photoIndex + 1}`}
                        fill
                        className="object-cover"
                      />
                      <button
                        onClick={() => removePhotoFromGroup(photoIndex, group.id)}
                        className={cn(
                          "absolute p-1.5 bg-black/60 hover:bg-black/80 rounded-full transition-opacity",
                          isMobile 
                            ? "top-1.5 right-1.5 opacity-100" 
                            : "top-2 right-2 opacity-0 group-hover:opacity-100"
                        )}
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                      <div className={cn(
                        "absolute px-1.5 py-0.5 bg-black/60 rounded",
                        isMobile ? "bottom-1.5 left-1.5" : "bottom-2 left-2"
                      )}>
                        <span className="text-[10px] text-white font-medium">{photoIndex + 1}</span>
                      </div>
                      {!isMobile && (
                        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Grip className="h-4 w-4 text-white drop-shadow" />
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {/* Drop Zone - Desktop only */}
                {!isMobile && (
                  <div
                    className="aspect-square rounded-md border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-gray-400 hover:border-gray-400 hover:bg-gray-100 transition-colors"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const photoIndex = parseInt(e.dataTransfer.getData('photoIndex'));
                      const fromGroupId = e.dataTransfer.getData('fromGroupId');
                      if (fromGroupId !== group.id) {
                        movePhotoToGroup(photoIndex, fromGroupId, group.id);
                      }
                    }}
                  >
                    <Plus className="h-6 w-6" />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Create New Group - Desktop only */}
        {!isMobile && (
          <Button
            onClick={createNewGroup}
            variant="outline"
            className="w-full mt-6 rounded-md border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create New Group
          </Button>
        )}

        {/* Actions */}
        <div className={cn("flex gap-3 mt-6", isMobile ? "fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200" : "")}>
          {onBack && !isMobile && (
            <Button
              variant="outline"
              onClick={onBack}
              className="rounded-md"
            >
              Back
            </Button>
          )}
          <Button
            onClick={() => onComplete(groups)}
            disabled={groups.length === 0 || groups.some(g => g.photoIndexes.length === 0)}
            className={cn(
              "flex-1 bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-semibold",
              isMobile ? "rounded-xl h-12" : "rounded-md"
            )}
          >
            Continue with {groups.length} Product{groups.length !== 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}

