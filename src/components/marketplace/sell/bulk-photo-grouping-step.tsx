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
      <div className="min-h-screen bg-gray-50 pt-20 pb-20 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-gray-900 animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Analysing your photos...
          </h3>
          <p className="text-sm text-gray-600">
            Our AI is grouping photos by product
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-20">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Review Product Groups
          </h1>
          <p className="text-gray-600">
            We've grouped your photos by product. Drag photos to reassign them or create new groups.
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-white border border-gray-200 rounded-md p-4 mb-6">
            <p className="text-sm text-gray-700">
              ⚠️ AI grouping had issues. We've created individual groups you can merge manually.
            </p>
          </div>
        )}

        {/* Groups */}
        <div className="space-y-6">
          {groups.map((group) => (
            <motion.div
              key={group.id}
              layout
              className="bg-white rounded-md p-6 border-2 border-gray-200"
            >
              {/* Group Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex-1">
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
                        className="rounded-md"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        onClick={finishEditing}
                        className="rounded-md"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {group.suggestedName}
                      </h3>
                      <button
                        onClick={() => startEditing(group.id, group.suggestedName)}
                        className="p-1 hover:bg-gray-100 rounded-md transition-colors"
                      >
                        <Edit2 className="h-4 w-4 text-gray-400" />
                      </button>
                    </div>
                  )}
                  <p className="text-sm text-gray-500 mt-1">
                    {group.photoIndexes.length} photo{group.photoIndexes.length !== 1 ? 's' : ''}
                    {group.confidence < 80 && (
                      <span className="ml-2 text-yellow-600">• Low confidence - please review</span>
                    )}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteGroup(group.id)}
                  disabled={groups.length === 1}
                  className="rounded-md"
                >
                  <X className="h-4 w-4 mr-1" />
                  Delete Group
                </Button>
              </div>

              {/* Photos Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {group.photoIndexes.map((photoIndex) => {
                  const photo = photos[photoIndex];
                  return (
                    <div
                      key={photoIndex}
                      className="relative aspect-square rounded-md overflow-hidden bg-gray-100 group cursor-move"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('photoIndex', photoIndex.toString());
                        e.dataTransfer.setData('fromGroupId', group.id);
                      }}
                    >
                      <Image
                        src={photo.cardUrl || photo.url}
                        alt={`Photo ${photoIndex + 1}`}
                        fill
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                      <button
                        onClick={() => removePhotoFromGroup(photoIndex, group.id)}
                        className="absolute top-2 right-2 p-1 bg-black/60 hover:bg-black/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                      <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/60 rounded-md">
                        <span className="text-xs text-white font-medium">{photoIndex + 1}</span>
                      </div>
                      <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Grip className="h-4 w-4 text-white drop-shadow" />
                      </div>
                    </div>
                  );
                })}
                
                {/* Drop Zone */}
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
              </div>
            </motion.div>
          ))}
        </div>

        {/* Create New Group */}
        <Button
          onClick={createNewGroup}
          variant="outline"
          className="w-full mt-6 rounded-md border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create New Group
        </Button>

        {/* Actions */}
        <div className="flex gap-3 mt-8">
          {onBack && (
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
            className="flex-1 rounded-md bg-gray-900 hover:bg-gray-800"
          >
            Continue with {groups.length} Product{groups.length !== 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}

