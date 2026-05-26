"use client";
import React, { useState } from "react";
import { Project, ProjectType, ProjectCreate } from "@/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Box, Tag, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";

const projectTypes: { type: ProjectType; label: string; icon: React.ReactNode; description: string; color: string }[] = [
  {
    type: "classification",
    label: "Product Classification",
    icon: <Tag className="w-6 h-6" />,
    description: "Assign product images to predefined product types",
    color: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  },
  {
    type: "object-detection",
    label: "Product Labeling",
    icon: <Box className="w-6 h-6" />,
    description: "Draw boxes and label products for model training",
    color: "bg-blue-500/10 text-blue-600 border-blue-200",
  },
];

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (project: ProjectCreate) => Promise<Project>;
  isLoading: boolean;
}

export default function CreateProjectModal({
  isOpen,
  onClose,
  onCreate,
  isLoading,
}: CreateProjectModalProps) {
  const [step, setStep] = useState<"type" | "details">("type");
  const [selectedType, setSelectedType] = useState<ProjectType | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [classInput, setClassInput] = useState("");
  const [initialClassLabels, setInitialClassLabels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleTypeSelect = (type: ProjectType) => {
    setSelectedType(type);
    setStep("details");
    setError(null);
  };

  const handleBack = () => {
    setStep("type");
    setError(null);
  };

  const addClassLabels = (value: string) => {
    const nextNames = value
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);

    if (!nextNames.length) return;

    setInitialClassLabels((current) => {
      const seen = new Set(current.map((name) => name.toLowerCase()));
      const additions = nextNames.filter((name) => {
        const key = name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return [...current, ...additions];
    });
    setClassInput("");
  };

  const removeClassLabel = (name: string) => {
    setInitialClassLabels((current) => current.filter((item) => item !== name));
  };

  const handleCreate = async () => {
    if (!projectName.trim()) {
      setError("Project name is required");
      return;
    }

    if (!selectedType) {
      setError("Please select a project type");
      return;
    }

    const classLabels = [
      ...initialClassLabels,
      ...classInput
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    ].filter((name, index, array) => array.findIndex((item) => item.toLowerCase() === name.toLowerCase()) === index);

    if (selectedType === "classification" && classLabels.length === 0) {
      setError("Please enter at least one product type");
      return;
    }

    try {
      await onCreate({
        name: projectName.trim(),
        type: selectedType,
        description: projectDescription.trim(),
        initial_class_labels: selectedType === "classification" ? classLabels : [],
      });
      setProjectName("");
      setProjectDescription("");
      setClassInput("");
      setInitialClassLabels([]);
      setSelectedType(null);
      setStep("type");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={step === "type" ? "Create Project" : "Project Details"}
      size="lg"
    >
      <div className="py-2">
        {step === "type" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {projectTypes.map((item) => (
              <button
                key={item.type}
                onClick={() => handleTypeSelect(item.type)}
                className={cn(
                  "p-5 rounded-2xl border-2 text-left transition-all duration-200 flex flex-col items-start gap-4 hover:-translate-y-1 hover:shadow-lg",
                  selectedType === item.type
                    ? "border-accent bg-accent/5 ring-4 ring-accent/10"
                    : "border-border bg-card hover:border-accent/30"
                )}
              >
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", item.color)}>
                  {item.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">
                    {item.label}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="space-y-4">
              <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 flex items-center gap-4">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", projectTypes.find(t => t.type === selectedType)?.color)}>
                  {projectTypes.find(t => t.type === selectedType)?.icon}
                </div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Type</p>
                  <p className="font-semibold text-foreground">{projectTypes.find(t => t.type === selectedType)?.label}</p>
                </div>
                <Button variant="ghost" size="sm" className="ml-auto h-8" onClick={handleBack}>
                  Change
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Project Name
                </label>
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. May SKU classification"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Description
                </label>
                <textarea
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder="Project goal or dataset scope"
                  rows={3}
                  className="w-full px-4 py-2 bg-muted/20 border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none transition-colors resize-none"
                />
              </div>

              {selectedType === "classification" && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">
                    Product Type
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={classInput}
                      onChange={(e) => setClassInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addClassLabels(classInput);
                        }
                      }}
                      placeholder="Example: T-shirt, Jeans, Shoes"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => addClassLabels(classInput)}
                      disabled={!classInput.trim()}
                      className="h-10 w-10 px-0"
                      title="Add product type"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {initialClassLabels.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {initialClassLabels.map((name) => (
                        <span
                          key={name}
                          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                        >
                          {name}
                          <button
                            type="button"
                            onClick={() => removeClassLabel(name)}
                            className="rounded-full p-0.5 hover:bg-emerald-100"
                            aria-label={`Remove ${name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    You can enter multiple types at once, separated by commas.
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-medium">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-border">
        {step === "details" ? (
          <Button variant="secondary" onClick={handleBack} disabled={isLoading}>
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          {step === "details" && (
            <Button
              onClick={handleCreate}
              isLoading={isLoading}
              disabled={!projectName.trim() || (selectedType === "classification" && !classInput.trim() && initialClassLabels.length === 0)}
              className="px-8"
            >
              Create Project
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

