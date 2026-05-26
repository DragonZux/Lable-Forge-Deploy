'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence, easeOut } from 'framer-motion'
import { isAuthenticated } from '@/lib/auth'
import { Button } from '@/components/ui/Button'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { Badge } from '@/components/ui/Badge'
import { useTheme } from '@/contexts/ThemeContext'
import {
  ArrowRight,
  Database,
  Zap,
  Target,
  Users,
  ShieldCheck,
  BarChart3,
  ChevronDown,
  Cpu,
  Server,
  HardDrive,
  Terminal,
  Activity,
  Lock,
  ExternalLink,
  Sun,
  Moon
} from 'lucide-react'

// Simulated log entries for the local server console
const SIMULATED_LOGS = [
  'Initializing Local SAM (Segment Anything Model) engine...',
  'Cluster status: 4 active GPU nodes detected and balanced.',
  'Annotator-04 accepted review for project "YOLOv8-Safety-Vest".',
  'SAM pre-segmentation completed for "frame_1092.png" (42ms).',
  'Workspace "AI-R&D-Department" auto-synced with NAS-Storage-01.',
  'Export request: COCO format generated for "Robotics-Gripper-v2".',
  'Database query indexed: 580,240 frames cataloged successfully.',
  'User "hung.tran" uploaded 1,420 new frames to "Defect-Detection".',
  'Model training trigger sent to Cluster node-03 for YOLOv9.',
  'Reviewer "linh.nguyen" locked golden-set "Obstacle-Avoidance-v3".',
  'Active cache cleared. Hashing verified for 24,902 image vectors.',
  'SAM inference latency optimized: 39ms average on Node-01.'
]

export default function LandingPage() {
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [activeFaq, setActiveFaq] = useState<number | null>(null)

  // Real-time GPU state simulation
  const [gpuLoad, setGpuLoad] = useState([74, 82, 45, 91])
  const [gpuTemp, setGpuTemp] = useState([62, 65, 54, 69])
  const [systemUptime] = useState('24d 18h 42m')
  const [logConsole, setLogConsole] = useState<string[]>([])
  const logIndexRef = useRef(0)

  useEffect(() => {
    setMounted(true)
    if (isAuthenticated()) {
      router.push('/dashboard')
    } else {
      setIsChecking(false)
    }
  }, [router])

  // GPU Load and Temp fluctuation animation loop
  useEffect(() => {
    if (!mounted || isChecking) return

    const interval = setInterval(() => {
      setGpuLoad(prev => prev.map(val => {
        const change = Math.floor(Math.random() * 9) - 4
        return Math.max(35, Math.min(98, val + change))
      }))
      setGpuTemp(prev => prev.map(val => {
        const change = Math.floor(Math.random() * 5) - 2
        return Math.max(50, Math.min(82, val + change))
      }))
    }, 2500)

    return () => clearInterval(interval)
  }, [mounted, isChecking])

  // Real-time server log console animation loop
  useEffect(() => {
    if (!mounted || isChecking) return

    // Initial logs load
    setLogConsole(SIMULATED_LOGS.slice(0, 4))
    logIndexRef.current = 4

    const interval = setInterval(() => {
      setLogConsole(prev => {
        const nextLog = SIMULATED_LOGS[logIndexRef.current % SIMULATED_LOGS.length]
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
        const formattedLog = `[${timestamp}] ${nextLog}`
        logIndexRef.current++
        return [...prev.slice(1), formattedLog]
      })
    }, 4000)

    return () => clearInterval(interval)
  }, [mounted, isChecking])

  if (!mounted || isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center relative">
          <div className="absolute inset-0 bg-accent/5 blur-[100px] rounded-full" />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-24 h-24 relative mx-auto mb-8 z-10"
          >
            <img 
              src="/logo.png" 
              alt="Label Forge" 
              className="w-full h-full object-contain rounded-[2rem] shadow-accent animate-pulse"
            />
          </motion.div>
          <h1 className="text-3xl font-display text-foreground mb-3 tracking-tight">Label Forge</h1>
          <p className="text-muted-foreground font-mono text-xs uppercase tracking-[0.2em]">Initializing Intranet Hub</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden selection:bg-accent/10 selection:text-accent font-sans">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 relative">
              <img 
                src="/logo.png" 
                alt="Label Forge Logo" 
                className="w-full h-full object-contain rounded-xl shadow-accent"
              />
            </div>
            <span className="text-xl font-display text-foreground tracking-tight">
              Label<span className="gradient-text">Forge</span>
              <span className="ml-2 text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">INTRANET</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-10 text-sm font-medium text-muted-foreground">
            <Link href="#capabilities" className="hover:text-accent transition-colors">Capabilities</Link>
            <Link href="#gpu-monitor" className="hover:text-accent transition-colors">GPU Cluster</Link>
            <Link href="#dev-hub" className="hover:text-accent transition-colors">ML SDK Integration</Link>
            <Link href="#quality-pipeline" className="hover:text-accent transition-colors">QA Workflow</Link>
            <Link href="#faq" className="hover:text-accent transition-colors">FAQ</Link>
          </div>
          <div className="flex items-center gap-4">
            {/* Header Theme Toggle Button */}
            <button
              onClick={() => toggleTheme()}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-all hover:border-accent/30 hover:bg-muted/50 hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/20 active:scale-95"
              title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
            >
              {theme === "light" ? (
                <Moon className="w-4.5 h-4.5 transition-transform hover:rotate-12" />
              ) : (
                <Sun className="w-4.5 h-4.5 text-amber-500 transition-transform hover:scale-110" />
              )}
            </button>

            <Link href="/login">
              <Button variant="ghost" className="hidden sm:flex text-sm font-bold">Sign In</Button>
            </Link>
            <Link href="/login">
              <Button className="shadow-accent group rounded-full px-8 font-bold">
                Get Started
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-28 px-6 overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/4 -z-10" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent-secondary/5 blur-[100px] rounded-full translate-y-1/2 -translate-x-1/4 -z-10" />

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: easeOut }}
          >
            <SectionLabel label="INTERNAL VISION AI PORTAL - ENTERPRISE HUB" isPulsing className="mb-8" />
            <h1 className="text-4xl md:text-5xl lg:text-[2.85rem] font-display text-foreground leading-[1.15] tracking-tight mb-8">
              Manage Datasets & <br />
              Accelerate AI Labeling.
              <span className="relative inline-block ml-2">
                <span className="gradient-text">Local & Secure.</span>
                <span className="gradient-underline" />
              </span>
            </h1>
            <p className="text-lg text-muted-foreground mb-10 max-w-lg leading-relaxed">
              The ultimate Computer Vision data pipeline optimized for enterprise AI teams. Manage massive datasets locally, automate labeling with private SAM (Segment Anything Model) instances, and export training-ready assets securely.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Link href="/login" className="w-full sm:w-auto">
                <Button size="lg" className="w-full h-16 px-10 shadow-accent-lg text-base font-bold rounded-2xl">
                  Access Workspace
                </Button>
              </Link>
              <a href="#dev-hub" className="w-full sm:w-auto">
                <Button variant="secondary" size="lg" className="w-full h-16 px-10 group text-base font-bold rounded-2xl border-border/50">
                  <Terminal className="w-5 h-5 mr-3 text-accent" />
                  View SDK Docs
                </Button>
              </a>
            </div>

            <div className="mt-14 flex flex-wrap items-center gap-x-8 gap-y-4">
              <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Lock className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <span className="font-semibold text-foreground/80">100% Secure Local Intranet</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center">
                  <Server className="w-3.5 h-3.5 text-accent" />
                </div>
                <span className="font-semibold text-foreground/80">LDAP & Active Directory SSO Ready</span>
              </div>
            </div>
          </motion.div>

          {/* High-Tech Interactive GPU Cluster Monitor */}
          <div className="relative" id="gpu-monitor">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, ease: easeOut }}
              className="relative aspect-[1.05/1] w-full"
            >
              {/* Rotating Dashed Ring */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 border-2 border-dashed border-accent/15 rounded-[3.5rem] pointer-events-none"
              />

              {/* Main Monitor Panel */}
              <div className="absolute inset-6 bg-gradient-to-br from-card to-muted/20 rounded-[2.5rem] border border-border shadow-2xl overflow-hidden backdrop-blur-3xl p-6 flex flex-col justify-between">
                <div>
                  {/* Console Header */}
                  <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse-soft" />
                      <span className="text-xs font-mono font-bold tracking-wider text-foreground">LOCAL GPU CLUSTER CLUSTER-01</span>
                    </div>
                    <Badge variant="accent" className="text-[10px] font-mono py-0.5 px-2 bg-emerald-500/10 border-emerald-500/30 text-emerald-500 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      ALL NODES OPERATIONAL
                    </Badge>
                  </div>

                  {/* GPU Nodes Grid */}
                  <div className="grid grid-cols-2 gap-3.5 mb-4">
                    {gpuLoad.map((load, idx) => (
                      <div key={idx} className="p-3.5 bg-card border border-border/80 rounded-2xl flex flex-col justify-between shadow-sm relative overflow-hidden group hover:border-accent/30 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="text-[10px] font-mono text-muted-foreground">NODE 0{idx + 1}</div>
                            <div className="text-xs font-bold font-display">{idx < 2 ? 'RTX 4090' : 'RTX A6000'}</div>
                          </div>
                          <Cpu className="w-3.5 h-3.5 text-accent/50 group-hover:text-accent transition-colors" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] font-mono">
                            <span className="text-muted-foreground">Load:</span>
                            <span className="font-bold text-foreground">{load}%</span>
                          </div>
                          {/* Mini Progress Bar */}
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <motion.div 
                              animate={{ width: `${load}%` }} 
                              transition={{ duration: 1.5 }}
                              className={`h-full rounded-full bg-gradient-to-r ${load > 85 ? 'from-red-500 to-amber-500' : 'from-accent to-accent-secondary'}`} 
                            />
                          </div>
                          <div className="flex justify-between text-[10px] font-mono text-muted-foreground pt-1">
                            <span>Temp: {gpuTemp[idx]}°C</span>
                            <span>Fan: Auto</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Local Storage details */}
                  <div className="p-4 bg-accent/5 border border-accent/15 rounded-2xl">
                    <div className="flex justify-between items-center mb-1.5 text-xs">
                      <div className="flex items-center gap-2 font-semibold">
                        <HardDrive className="w-4 h-4 text-accent" />
                        <span>Central Net Storage (Intranet NAS-01)</span>
                      </div>
                      <span className="font-mono text-muted-foreground">74.8 / 120.0 TB</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div className="h-full w-[62.3%] bg-accent rounded-full" />
                    </div>
                  </div>
                </div>

                {/* Console Log Feed */}
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-2">
                    <Activity className="w-3.5 h-3.5 text-accent" />
                    <span>Real-time Intranet Event Logs:</span>
                  </div>
                  <div className="bg-foreground text-background font-mono text-[10px] rounded-xl p-3.5 space-y-1.5 h-24 overflow-hidden flex flex-col justify-end opacity-90 shadow-inner">
                    <AnimatePresence initial={false}>
                      {logConsole.map((log, i) => (
                        <motion.div
                          key={log + i}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                          transition={{ duration: 0.3 }}
                          className="truncate leading-relaxed text-emerald-400 border-l border-emerald-500/20 pl-2"
                        >
                          {log}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Floating Performance Indicator */}
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -bottom-6 -left-4 w-44 bg-card border border-border rounded-2xl shadow-2xl p-4 z-20"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Activity className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div>
                    <div className="text-[9px] font-mono text-muted-foreground uppercase">System Uptime</div>
                    <div className="text-xs font-bold tracking-tight text-foreground">{systemUptime}</div>
                  </div>
                </div>
              </motion.div>

              {/* Floating SAM speed Badge */}
              <motion.div
                animate={{ y: [0, 10, 0], x: [0, -5, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="absolute top-1/4 -right-6 w-40 bg-foreground text-background p-4 rounded-2xl shadow-2xl z-20"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white">
                    <Zap className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <div className="text-[9px] font-mono text-muted-foreground uppercase">SAM Inference</div>
                    <div className="text-xs font-bold tracking-tight">Avg. 41ms/object</div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Internal Infrastructure Metrics */}
      <section className="py-16 border-y border-border bg-muted/20 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 text-center">
            <StatItem value="1.2M+" label="Frames Imported" />
            <StatItem value="99.9%" label="QA Accuracy" />
            <StatItem value="4.8M+" label="Bounding Box Vectors" />
            <StatItem value="12 Gbit" label="LAN Sync Bandwidth" />
          </div>
        </div>
      </section>

      {/* Core Capabilities */}
      <section id="capabilities" className="py-24 px-6 relative">
        <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-accent/5 blur-[150px] rounded-full -translate-x-1/2 -translate-y-1/2 -z-10" />

        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <SectionLabel label="CORE CAPABILITIES" className="mb-6" />
            <h2 className="text-3xl font-display mb-6">Consolidate Datasets, Supercharge Annotation Throughput</h2>
            <p className="text-muted-foreground text-base max-w-2xl mx-auto leading-relaxed">
              Label Forge provides high-performance annotation toolsets and robust dataset version control directly within your secure private cloud.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Database className="w-6 h-6" />}
              title="Local Storage & NAS Integration"
              description="Mount NFS, Samba, or private S3 buckets directly. Query and index millions of high-resolution images instantly with zero network cost."
            />
            <FeatureCard
              icon={<Target className="w-6 h-6" />}
              title="AI-Assisted Auto Labeling (Local SAM)"
              description="Automate labeling with Meta's Segment Anything Model running locally. Auto-segment objects with simple click actions, slashing manual tracing by 80%."
              isFeatured
            />
            <FeatureCard
              icon={<ShieldCheck className="w-6 h-6" />}
              title="Absolute Intranet Security"
              description="Operates 100% inside your corporate perimeter. Confidential research frames, medical records, or proprietary defects never touch public servers."
            />
            <FeatureCard
              icon={<Users className="w-6 h-6" />}
              title="Granular RBAC Permission Matrix"
              description="Enforce project roles: Owners, Admins, Members, Annotators, Reviewers, and Viewers. Prevent annotation collisions and track change logs."
            />
            <FeatureCard
              icon={<BarChart3 className="w-6 h-6" />}
              title="Performance Analytics"
              description="Monitor frame completion rates, average latency per bounding box, and review rejection ratios for each member in real time."
            />
            <FeatureCard
              icon={<Zap className="w-6 h-6" />}
              title="ML-Ready Export Formats"
              description="Compile and export finalized dataset splits into COCO (JSON), YOLO (TXT), or Pascal VOC (XML) manifests with a single click."
            />
          </div>
        </div>
      </section>

      {/* Developer Hub & Local Integration (Replaces Commercial Pricing) */}
      <section id="dev-hub" className="py-24 px-6 bg-muted/30 relative">
        <div className="absolute inset-0 bg-accent/[0.01] -z-10" />
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <SectionLabel label="ML DEVS & INTEGRATIONS" className="mb-6" />
            <h2 className="text-3xl font-display mb-6">Connect APIs & Streamline Training Pipelines</h2>
            <p className="text-muted-foreground text-base max-w-xl mx-auto">
              Developer-first integrations to link network storage and synchronize dataset splits with GPU clusters.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Dev Card 1 */}
            <div className="p-8 rounded-[2rem] bg-card border border-border shadow-sm flex flex-col justify-between hover:border-accent/20 transition-all duration-300">
              <div>
                <div className="w-12 h-12 rounded-xl bg-accent/5 flex items-center justify-center text-accent mb-6">
                  <HardDrive className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">01 / Mount Local NAS</h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                  Link images on centralized network attached storage. Automatically scan directories and register new files on custom cron schedules.
                </p>
                <div className="bg-foreground text-background rounded-xl p-4 font-mono text-xs leading-normal overflow-x-auto shadow-inner text-left">
                  <span className="text-emerald-400"># Mount NFS network share</span><br />
                  mount -t nfs 192.168.1.50:/share/datasets /mnt/labelforge
                </div>
              </div>
              <div className="mt-8 pt-6 border-t border-border flex items-center gap-2 text-xs font-semibold text-accent">
                <span>View Network Mount Docs</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Dev Card 2 */}
            <div className="p-8 rounded-[2rem] bg-gradient-to-br from-accent/[0.02] to-accent-secondary/[0.02] border border-accent shadow-[0_15px_40px_rgba(0,82,255,0.06)] relative flex flex-col justify-between">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-accent text-white text-[9px] font-mono font-bold px-4 py-1.5 rounded-full tracking-wider uppercase shadow-md shadow-accent/20">
                ML Python Pipeline
              </div>
              <div>
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent mb-6">
                  <Terminal className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">02 / Python SDK Query</h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                  Query labeled data splits and fetch training manifests directly inside your Python training scripts running on PyTorch or TensorFlow.
                </p>
                <div className="bg-foreground text-background rounded-xl p-4 font-mono text-xs leading-normal overflow-x-auto shadow-inner text-left">
                  <span className="text-emerald-400">import</span> labelforge <span className="text-emerald-400">as</span> lf<br />
                  <br />
                  client = lf.IntranetClient(<span className="text-amber-300">&quot;http://local-lf:3000&quot;</span>)<br />
                  dataset = client.get_dataset(<span className="text-amber-300">&quot;proj-092&quot;</span>)<br />
                  dataset.download(output=<span className="text-amber-300">&quot;./data/&quot;</span>, format=<span className="text-amber-300">&quot;yolo&quot;</span>)
                </div>
              </div>
              <div className="mt-8 pt-6 border-t border-accent/20 flex items-center gap-2 text-xs font-semibold text-accent">
                <span>View Python API Reference</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Dev Card 3 */}
            <div className="p-8 rounded-[2rem] bg-card border border-border shadow-sm flex flex-col justify-between hover:border-accent/20 transition-all duration-300">
              <div>
                <div className="w-12 h-12 rounded-xl bg-accent/5 flex items-center justify-center text-accent mb-6">
                  <Cpu className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">03 / Model Training Sync</h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                  Trigger downstream training runs, compute pipelines, or CI/CD model tests automatically as soon as a dataset version is finalized and locked.
                </p>
                <div className="bg-foreground text-background rounded-xl p-4 font-mono text-xs leading-normal overflow-x-auto shadow-inner text-left">
                  <span className="text-emerald-400"># Webhook Payload</span><br />
                  &#123;<br />
                  &nbsp;&nbsp;<span className="text-amber-300">&quot;event&quot;</span>: <span className="text-amber-300">&quot;dataset.version_locked&quot;</span>,<br />
                  &nbsp;&nbsp;<span className="text-amber-300">&quot;project&quot;</span>: <span className="text-amber-300">&quot;Safety-Vest-v2&quot;</span>,<br />
                  &nbsp;&nbsp;<span className="text-amber-300">&quot;total_frames&quot;</span>: 24902<br />
                  &#125;
                </div>
              </div>
              <div className="mt-8 pt-6 border-t border-border flex items-center gap-2 text-xs font-semibold text-accent">
                <span>Configure Webhooks</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quality Control Pipeline (Replaces Testimonials) */}
      <section id="quality-pipeline" className="py-24 px-6 relative overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <SectionLabel label="QUALITY CONTROL PIPELINE (QA)" className="mb-6" />
            <h2 className="text-3xl font-display mb-6">Clean Datasets for Production-Grade ML Models</h2>
            <p className="text-muted-foreground text-base max-w-xl mx-auto">
              A multi-stage local review pipeline that guarantees annotation fidelity and clean bounding coordinates before model training.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <WorkflowStepCard
              step="STEP 01"
              title="Interactive Auto-Labeling"
              description="Annotators import frames and leverage a local SAM backend to instantly segment objects, refining bounding borders with ease."
              roleName="Annotator Role"
              bgColor="bg-accent/5"
            />
            <WorkflowStepCard
              step="STEP 02"
              title="Cross-Review Quality Audit"
              description="Reviewers double-check label classes, box boundaries, and IoU coverage. Rejects and routes back inaccurate frames with feedback."
              roleName="Reviewer Role"
              bgColor="bg-indigo-500/5"
            />
            <WorkflowStepCard
              step="STEP 03"
              title="Golden Set Freeze"
              description="Project Owners approve finalized splits and freeze dataset versions, publishing immutable reference models for model runs."
              roleName="Project Owner Approved"
              bgColor="bg-emerald-500/5"
            />
          </div>
        </div>
      </section>

      {/* Platform FAQ Section */}
      <section id="faq" className="py-24 px-6 border-t border-border bg-muted/10">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <SectionLabel label="INTERNAL KNOWLEDGE FAQ" className="mb-6" />
            <h2 className="text-3xl font-display mb-4">Frequently Asked Questions</h2>
            <p className="text-muted-foreground text-sm">Troubleshoot common workspace questions and operations.</p>
          </div>

          <div className="space-y-4">
            <FaqItem
              id={1}
              question="How do we link images from our company NAS?"
              answer="Administrators can navigate to Project Settings -> Storage, select the network protocol (NFS/SMB Share or Local Path), and specify the target mount directory. Label Forge indexes files in-place without duplicating datasets, saving network bandwidth and storage."
              activeFaq={activeFaq}
              setActiveFaq={setActiveFaq}
            />
            <FaqItem
              id={2}
              question="Where do we obtain login credentials?"
              answer="Label Forge seamlessly integrates with enterprise LDAP or Active Directory SSO. Use your regular corporate single sign-on email and password to log in directly without setting up separate platform credentials."
              activeFaq={activeFaq}
              setActiveFaq={setActiveFaq}
            />
            <FaqItem
              id={3}
              question="Will local SAM auto-labeling lag under high concurrent user load?"
              answer="No. The system features an active local GPU Queue Balancer. Annotation inference requests are balanced across available RTX 4090 and RTX A6000 nodes, keeping average point-segmentation click latency under 50ms per frame."
              activeFaq={activeFaq}
              setActiveFaq={setActiveFaq}
            />
          </div>
        </div>
      </section>

      {/* Local Call to Action */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto bg-foreground text-background rounded-[3rem] p-12 md:p-24 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute inset-0 dot-pattern opacity-[0.05]" />
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-accent/20 to-transparent pointer-events-none" />

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative z-10"
          >
            <h2 className="text-3xl md:text-4xl font-display mb-6 leading-tight">Ready to Supercharge Your Computer Vision Pipeline?</h2>
            <p className="text-muted-foreground text-base mb-10 max-w-xl mx-auto leading-relaxed">
              Log in now to mount your first local storage volume, launch an annotation project, and link your training scripts.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <Link href="/login" className="w-full sm:w-auto">
                <Button size="lg" className="w-full h-16 px-12 text-base font-bold shadow-accent rounded-2xl">
                  Access Workspace
                </Button>
              </Link>
              <Link href="#capabilities" className="text-muted-foreground font-semibold hover:text-white transition-colors flex items-center gap-2 group">
                Learn more <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 border-t border-border px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 relative">
                  <img 
                    src="/logo.png" 
                    alt="Label Forge" 
                    className="w-full h-full object-contain rounded-xl shadow-accent"
                  />
                </div>
                <span className="text-xl font-display tracking-tight text-foreground">LabelForge</span>
                <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">INTRANET</span>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mb-6">
                Enterprise CV data platforms built for secure, high-throughput model training and internal AI research operations.
              </p>
            </div>

            <FooterColumn title="Infrastructure Links" links={['Dashboard Home', 'SDK Documentation', 'Cluster Node Status', 'API Gateway Portal']} />
            <FooterColumn title="Technical Support" links={['R&D Server Room', 'Slack Channel (#ai-labeling)', 'IT Support Desk (Ext: 1102)', 'Report System Issue']} />
          </div>

          <div className="pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-6 text-xs font-mono text-muted-foreground uppercase tracking-widest">
            <p>© 2026 LabelForge Enterprise Portal. All rights reserved.</p>
            <div className="flex items-center gap-8">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                All Intranet Nodes Operational
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, description, isFeatured = false }: { icon: React.ReactNode, title: string, description: string, isFeatured?: boolean }) {
  return (
    <motion.div
      whileHover={{ y: -6 }}
      className={`p-8 rounded-[2rem] border transition-all duration-500 group relative overflow-hidden ${isFeatured
          ? 'bg-gradient-to-br from-accent/5 to-accent-secondary/5 border-accent/20 shadow-lg'
          : 'bg-card border-border hover:border-accent/20 hover:shadow-xl'
        }`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-all duration-500 ${isFeatured
          ? 'bg-gradient-to-br from-accent to-accent-secondary text-white shadow-accent'
          : 'bg-accent/5 text-accent group-hover:bg-gradient-to-br group-hover:from-accent group-hover:to-accent-secondary group-hover:text-white group-hover:shadow-accent'
        }`}>
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3 tracking-tight">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">
        {description}
      </p>

      {/* Hover background highlight */}
      <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-accent/5 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
    </motion.div>
  )
}

function WorkflowStepCard({ step, title, description, roleName, bgColor }: { step: string, title: string, description: string, roleName: string, bgColor: string }) {
  return (
    <div className={`p-8 rounded-[2rem] border border-border bg-card shadow-sm hover:shadow-md hover:border-accent/15 transition-all duration-300 flex flex-col justify-between relative overflow-hidden group`}>
      <div className={`absolute top-0 right-0 w-32 h-32 ${bgColor} blur-2xl rounded-full translate-x-12 -translate-y-12 opacity-80 group-hover:opacity-100 transition-opacity`} />
      <div className="relative z-10">
        <span className="font-mono text-xs font-bold text-accent px-3.5 py-1 bg-accent/5 rounded-full border border-accent/10">{step}</span>
        <h3 className="text-xl font-bold mt-5 mb-3 tracking-tight">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed mb-6">
          {description}
        </p>
      </div>
      <div className="relative z-10 flex items-center gap-2 text-xs font-semibold text-foreground/70">
        <Users className="w-4 h-4 text-accent" />
        <span>{roleName}</span>
      </div>
    </div>
  )
}

function FaqItem({ id, question, answer, activeFaq, setActiveFaq }: { id: number, question: string, answer: string, activeFaq: number | null, setActiveFaq: (id: number | null) => void }) {
  const isOpen = activeFaq === id

  return (
    <div className={`border rounded-[1.5rem] transition-all duration-300 overflow-hidden ${isOpen ? 'border-accent bg-accent/[0.01] shadow-md shadow-accent/5' : 'border-border bg-card hover:border-accent/15'}`}>
      <button
        onClick={() => setActiveFaq(isOpen ? null : id)}
        className="w-full px-6 py-5 flex items-center justify-between transition-colors text-left group"
      >
        <span className={`text-base font-bold transition-colors ${isOpen ? 'text-accent' : 'group-hover:text-accent'}`}>{question}</span>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 ${isOpen ? 'bg-accent text-white rotate-180' : 'bg-muted text-muted-foreground'}`}>
          <ChevronDown className="w-4 h-4" />
        </div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: easeOut }}
          >
            <div className="px-6 pb-5 text-muted-foreground text-sm leading-relaxed pt-1 border-t border-border/40">
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function FooterColumn({ title, links }: { title: string, links: string[] }) {
  return (
    <div className="flex flex-col gap-5">
      <h4 className="text-xs font-mono font-bold uppercase tracking-[0.2em] text-foreground">{title}</h4>
      <ul className="flex flex-col gap-3.5">
        {links.map(link => (
          <li key={link}>
            <Link href="#" className="text-xs text-muted-foreground hover:text-accent transition-colors font-medium">{link}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StatItem({ value, label }: { value: string, label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-3xl md:text-4xl font-display font-bold gradient-text mb-2">{value}</div>
      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.15em]">{label}</div>
    </div>
  )
}
