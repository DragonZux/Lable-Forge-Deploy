'use client'

import React, { useEffect, useState } from 'react'
import { useTestInference } from '@/hooks/useDeploy'
import { emitAppToast } from '@/lib/toast-events'
import { Card } from '@/components/ui/Card'
import { DeployedModel, PredictionResult } from '@/hooks/useDeploy'
import { 
  Globe, 
  Copy, 
  Eye, 
  EyeOff, 
  Terminal, 
  Play, 
  CheckCircle2, 
  ChevronRight,
  Clock,
  FlaskConical,
  AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { motion, AnimatePresence } from 'framer-motion'

interface DeployedModelCardProps {
  model: DeployedModel
  canTestInference?: boolean
}

export default function DeployedModelCard({ model, canTestInference = false }: DeployedModelCardProps) {
  const { testInference, isLoading: isTesting } = useTestInference(model.id)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [selectedSnippet, setSelectedSnippet] = useState<'python' | 'javascript' | 'curl'>('python')
  const [testResult, setTestResult] = useState<{
    predictions: PredictionResult[]
    processing_time_ms: number
  } | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [selectedTestFile, setSelectedTestFile] = useState<File | null>(null)
  const [testImagePreviewUrl, setTestImagePreviewUrl] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const hasApiKey = Boolean(model.api_key)
  const apiKeyForSnippet = model.api_key || '<api_key_hidden>'

  useEffect(() => {
    if (!selectedTestFile) {
      setTestImagePreviewUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(selectedTestFile)
    setTestImagePreviewUrl(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [selectedTestFile])

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleTestInference = async () => {
    if (!selectedTestFile) {
      setTestError('Please select an image file')
      return
    }

    try {
      setTestError(null)
      const result = await testInference(selectedTestFile)
      setTestResult(result)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Test failed'
      setTestError(msg)
      try { emitAppToast({ message: msg, type: 'error' }) } catch {}
    }
  }

  const codeSnippets = {
    python: `import requests

response = requests.post(
    "${model.api_endpoint}",
    headers={"Authorization": "Bearer ${apiKeyForSnippet}"},
    files={"file": open("image.jpg", "rb")}
)

predictions = response.json()["predictions"]
for pred in predictions:
    print(f"{pred['class_name']}: {pred['confidence']:.2f}")`,

    javascript: `const formData = new FormData();
formData.append("file", imageFile);

const response = await fetch("${model.api_endpoint}", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${apiKeyForSnippet}"
  },
  body: formData
});

const { predictions } = await response.json();
predictions.forEach(pred => {
  console.log(\`\${pred.class_name}: \${pred.confidence.toFixed(2)}\`);
});`,

    curl: `curl -X POST "${model.api_endpoint}" \\
  -H "Authorization: Bearer ${apiKeyForSnippet}" \\
  -F "file=@image.jpg"`,
  }

  return (
    <Card className="panel overflow-hidden p-0 group">
      <div className="p-8">
        {/* Card Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="icon-gradient w-12 h-12 rounded-2xl">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-foreground tracking-tight">Production Endpoint</h3>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-widest">
                  Live
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 mt-1">
                <Clock className="w-3 h-3" />
                Deployed on {new Date(model.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider bg-muted px-2 py-1 rounded">
              Model Ref: {model.training_job_id.slice(-8)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.8fr] gap-12">
          {/* Left Column: API Details & Snippets */}
          <div className="space-y-8">
            <div className="space-y-4">
              {model.metrics_snapshot && (
                <div className="grid grid-cols-3 gap-3 rounded-2xl border border-border bg-muted/20 p-3">
                  <DeployMetric label="mAP" value={model.metrics_snapshot.map_score} />
                  <DeployMetric label="Precision" value={model.metrics_snapshot.precision} />
                  <DeployMetric label="Recall" value={model.metrics_snapshot.recall} />
                </div>
              )}

              {model.artifact_url && (
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Model Artifact</p>
                  <p className="break-all font-mono text-[11px] text-foreground">{model.artifact_url}</p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">API Endpoint</label>
                <div className="relative group/field">
                  <div className="w-full h-11 flex items-center pl-4 pr-12 rounded-xl bg-muted/30 border border-border font-mono text-[11px] text-foreground overflow-x-auto whitespace-nowrap custom-scrollbar">
                    {model.api_endpoint}
                  </div>
                  <button
                    onClick={() => handleCopy(model.api_endpoint, 'endpoint')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-muted rounded-lg text-muted-foreground transition-colors"
                  >
                    {copiedField === 'endpoint' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Secret API Key</label>
                <div className="relative group/field">
                  <div className="w-full h-11 flex items-center pl-4 pr-24 rounded-xl bg-muted/30 border border-border font-mono text-[11px] text-foreground">
                    {hasApiKey ? (apiKeyVisible ? model.api_key : '*'.repeat(32)) : 'Restricted to project admins'}
                  </div>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      onClick={() => setApiKeyVisible(!apiKeyVisible)}
                      disabled={!hasApiKey}
                      className="p-2 hover:bg-muted rounded-lg text-muted-foreground transition-colors"
                    >
                      {apiKeyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => model.api_key && handleCopy(model.api_key, 'key')}
                      disabled={!hasApiKey}
                      className="p-2 hover:bg-muted rounded-lg text-muted-foreground transition-colors"
                    >
                      {copiedField === 'key' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Snippets */}
            <div className="space-y-4 pt-6 border-t border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-muted-foreground" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Implementation</span>
                </div>
                <div className="flex bg-muted rounded-lg p-1">
                  {(['python', 'javascript', 'curl'] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setSelectedSnippet(lang)}
                      className={cn(
                        "text-[10px] font-bold px-3 py-1 rounded-md transition-all uppercase tracking-tight",
                        selectedSnippet === lang
                          ? "bg-white text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative group/snippet">
                <pre className="text-[11px] bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-300 overflow-x-auto custom-scrollbar font-mono leading-relaxed">
                  <code>{codeSnippets[selectedSnippet]}</code>
                </pre>
                <button
                  onClick={() => handleCopy(codeSnippets[selectedSnippet], 'snippet')}
                  className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white/70 hover:text-white transition-all backdrop-blur-sm border border-white/10"
                >
                  {copiedField === 'snippet' ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Tester */}
          {canTestInference && (
          <div className="panel-soft flex flex-col p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="icon-gradient h-10 w-10 rounded-xl">
                <FlaskConical className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-foreground">Inference Lab</h4>
            </div>

            <div className="space-y-6 flex-1 flex flex-col justify-center">
              <div className="relative border-2 border-dashed border-border rounded-2xl p-8 text-center transition-all hover:bg-white/50 hover:border-accent/40 cursor-pointer group/test-upload">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    setSelectedTestFile(e.target.files?.[0] || null)
                    setTestResult(null)
                    setTestError(null)
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 bg-background rounded-2xl flex items-center justify-center text-muted-foreground group-hover/test-upload:text-accent group-hover/test-upload:scale-110 transition-all mb-4 shadow-sm">
                    <Play className="w-6 h-6 fill-current" />
                  </div>
                  <p className="text-xs font-bold text-foreground">
                    {selectedTestFile ? selectedTestFile.name : 'Select test image'}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest font-bold">
                    Click to browse
                  </p>
                </div>
              </div>

              <Button
                onClick={handleTestInference}
                disabled={!selectedTestFile || isTesting}
                className="w-full h-12 rounded-xl group"
              >
                {isTesting ? 'Analyzing Dataset...' : 'Test Inference'}
                {!isTesting && <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />}
              </Button>

              <AnimatePresence>
                {testError && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3"
                  >
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-[10px] font-bold text-red-800">{testError}</p>
                  </motion.div>
                )}

                {testResult && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-background border border-border rounded-2xl p-5 shadow-sm space-y-4"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-border">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Results</span>
                      <span className="text-[10px] font-mono text-emerald-600 font-bold">{testResult.processing_time_ms.toFixed(0)}ms</span>
                    </div>

                    {testImagePreviewUrl && (
                      <div className="space-y-3">
                        <div className="relative overflow-hidden rounded-2xl border border-border bg-muted">
                          <img
                            src={testImagePreviewUrl}
                            alt={selectedTestFile?.name || 'Test image preview'}
                            className="max-h-80 w-full object-contain"
                          />
                          <div className="absolute inset-0">
                            {testResult.predictions.map((pred, idx) => (
                              pred.bbox ? (
                                <div
                                  key={`${pred.class_name}-${idx}`}
                                  className="absolute rounded-md border-2 border-accent bg-accent/10 shadow-[0_0_0_1px_rgba(255,255,255,0.7)]"
                                  style={{
                                    left: `${pred.bbox.x * 100}%`,
                                    top: `${pred.bbox.y * 100}%`,
                                    width: `${pred.bbox.width * 100}%`,
                                    height: `${pred.bbox.height * 100}%`,
                                  }}
                                >
                                  <span className="absolute left-0 top-0 -translate-y-full rounded-t-md bg-accent px-2 py-1 text-[10px] font-bold text-white shadow-sm">
                                    {idx + 1}
                                  </span>
                                </div>
                              ) : null
                            ))}
                          </div>
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Test image with predicted boxes
                        </p>
                      </div>
                    )}
                    
                    <div className="space-y-3 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                      {testResult.predictions.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No objects detected</p>
                      ) : (
                        testResult.predictions.map((pred, idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-accent text-[10px] font-bold text-white">
                                {idx + 1}
                              </div>
                              <span className="text-xs font-bold text-foreground truncate">{pred.class_name}</span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-accent">
                              {(pred.confidence * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function DeployMetric({ label, value }: { label: string; value?: number | null }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg text-foreground">
        {typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : 'n/a'}
      </p>
    </div>
  )
}
