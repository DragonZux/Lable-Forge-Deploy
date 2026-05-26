// User types
export interface UserCreate {
  email: string;
  password: string;
  full_name: string;
}

export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  created_at: string;
}

export interface UserInDB extends UserResponse {
  hashed_password: string;
  is_active: boolean;
}

// Token types
export interface Token {
  access_token: string;
  token_type: string;
}

export interface TokenResponse extends Token {
  user: UserResponse;
}

// Workspace types
export interface MemberRef {
  user_id: string;
  role: "owner" | "admin" | "member" | "viewer";
}

export interface WorkspaceMember extends MemberRef {
  email?: string;
  full_name?: string;
}

export interface WorkspaceCreate {
  name: string;
}

export interface WorkspaceResponse {
  id: string;
  name: string;
  plan: string;
  owner_id?: string;
  member_count: number;
  members?: WorkspaceMember[]; // Detailed member list if available
  created_at: string;
}

export interface WorkspaceInDB extends WorkspaceResponse {
  owner_id: string;
  members: MemberRef[];
}

// Project types
export type ProjectType =
  | "object-detection"
  | "classification"
  | "instance-segmentation"
  | "semantic-segmentation";

export interface ProjectMember {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  joined_at: string;
}

export interface ProjectResponse {
  id: string;
  workspace_id: string;
  name: string;
  type: ProjectType;
  description: string;
  image_count: number;
  annotation_count: number;
  member_count: number;
  members?: ProjectMember[];
  class_labels?: ClassLabelResponse[];
  recent_images?: ImageResponse[];
  created_at: string;
  updated_at: string;
}

export interface ProjectCreate {
  name: string;
  type: ProjectType;
  description?: string;
  initial_class_labels?: string[];
}

// Invitation & Notification types
export type InvitationStatus = "pending" | "accepted" | "declined" | "expired" | "cancelled";
export type WorkspaceRole = "admin" | "member" | "viewer";
export type ProjectRole = "admin" | "annotator" | "reviewer" | "viewer";

export interface WorkspaceInvitationResponse {
  id: string;
  workspace_id: string;
  workspace_name: string;
  invited_by_name: string;
  invited_by_avatar?: string;
  invitee_email: string;
  role: WorkspaceRole;
  status: InvitationStatus;
  message?: string;
  created_at: string;
  expires_at: string;
}

export interface ProjectInvitationResponse {
  id: string;
  project_id: string;
  project_name: string;
  invited_by_name: string;
  invited_by_avatar?: string;
  invitee_email: string;
  role: ProjectRole;
  status: InvitationStatus;
  message?: string;
  created_at: string;
  expires_at: string;
}

export type NotificationType =
  | "workspace_invitation_received"
  | "workspace_invitation_accepted"
  | "workspace_invitation_declined"
  | "project_invitation_received"
  | "project_invitation_accepted"
  | "project_invitation_declined";

export interface NotificationResponse {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  entity_type: "workspace" | "project";
  entity_id: string;
  entity_name: string;
  invitation_id: string;
  token?: string;
  actor_name: string;
  actor_avatar?: string;
  is_read: boolean;
  action_required: boolean;
  action_taken: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  notifications: NotificationResponse[];
  total: number;
  unread_count: number;
}

// Image types
export type ImageSplit = "train" | "valid" | "test" | "unassigned";
export type ImageStatus = "uploaded" | "annotated" | "unannotated" | "needs_review" | "approved" | "rejected";
export type AnnotationStatus = "annotated" | "unannotated";
export type ReviewStatus = "none" | "needs_review" | "approved" | "rejected";
export type AssignmentStatus = "unassigned" | "assigned" | "in_progress" | "done";

export interface ImageResponse {
  id: string;
  project_id: string;
  filename: string;
  original_filename: string;
  url: string;
  width: number;
  height: number;
  split: ImageSplit;
  status: ImageStatus;
  annotation_status: AnnotationStatus;
  review_status: ReviewStatus;
  assigned_to_user_id?: string | null;
  assigned_by_user_id?: string | null;
  assigned_at?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  assignment_status: AssignmentStatus;
  reviewer_id?: string | null;
  reviewer_comment?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

export interface BatchAssignmentPayload {
  image_ids: string[];
  assigned_to_user_id: string;
  due_at?: string | null;
}

export interface AssignmentUpdatePayload {
  assigned_to_user_id?: string | null;
  due_at?: string | null;
  assignment_status?: AssignmentStatus;
}

export interface ImageReviewPayload {
  status: Extract<ImageStatus, "needs_review" | "approved" | "rejected">;
  comment?: string | null;
}

export interface UserProgress {
  user_id: string;
  email?: string | null;
  full_name?: string | null;
  total_assigned: number;
  done: number;
  in_progress: number;
  overdue: number;
  completion_rate: number;
  annotation_count: number;
}

// Annotation types
export type AnnotationType =
  | "bbox"
  | "polygon"
  | "polyline"
  | "points"
  | "ellipse"
  | "cuboid"
  | "mask"
  | "skeleton"
  | "tag"
  | "classification";

export interface BBoxCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PolygonCoordinates {
  points: [number, number][];
}

export interface AnnotationCreate {
  image_id: string;
  class_id: string;
  class_name: string;
  type: AnnotationType;
  coordinates: Record<string, any>;
}

export interface AnnotationResponse {
  id: string;
  image_id: string;
  project_id: string;
  created_by_user_id?: string | null;
  class_id: string;
  class_name: string;
  type: AnnotationType;
  coordinates: Record<string, any>;
  created_at: string;
}

// Class label types
export interface ClassLabelCreate {
  name: string;
  color: string;
}

export interface ClassLabelResponse {
  id: string;
  project_id: string;
  name: string;
  color: string;
  annotation_count: number;
}

// Dataset version types
export interface PreprocessingConfig {
  resize?: number;
  grayscale: boolean;
  auto_orient: boolean;
}

export interface AugmentationConfig {
  flip_horizontal: boolean;
  flip_vertical: boolean;
  rotation: number;
  brightness: number;
  blur: number;
  noise: number;
}

export interface DatasetVersionCreate {
  preprocessing: PreprocessingConfig;
  augmentation: AugmentationConfig;
  train_percent: number;
  valid_percent: number;
  test_percent: number;
}

export interface DatasetVersionResponse {
  id: string;
  project_id: string;
  version_number: number;
  preprocessing: PreprocessingConfig;
  augmentation: AugmentationConfig;
  train_count: number;
  valid_count: number;
  test_count: number;
  status: string;
  processing_progress?: number;
  zip_url?: string;
  created_at: string;
}

export interface AnnotationAuditEvent {
  id: string;
  project_id: string;
  image_id: string;
  annotation_id?: string | null;
  action: string;
  actor_user_id?: string | null;
  actor_name?: string | null;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  created_at: string;
}

// Training job types
export type TrainingJobStatus =
  | "queued"
  | "awaiting_colab"
  | "preparing"
  | "training"
  | "evaluating"
  | "done"
  | "failed";

export interface TrainingJobResponse {
  id: string;
  project_id: string;
  dataset_version_id: string;
  status: TrainingJobStatus;
  training_backend?: 'local' | 'colab';
  map_score?: number;
  precision?: number;
  recall?: number;
  epochs_completed: number;
  total_epochs: number;
  started_at?: string;
  finished_at?: string;
  created_at: string;
  error_message?: string;
  artifact_url?: string | null;
  training_config?: Record<string, any>;
  metrics_history?: Array<Record<string, any>>;
  confusion_matrix?: {
    labels: string[];
    matrix: number[][];
  } | null;
  sample_predictions?: Array<Record<string, any>>;
}

// Type aliases for convenience
export type Workspace = WorkspaceResponse
export type Project = ProjectResponse
export type Image = ImageResponse
export type Annotation = AnnotationResponse
export type ClassLabel = ClassLabelResponse
export type DatasetVersion = DatasetVersionResponse
export type TrainingJob = TrainingJobResponse
export type Notification = NotificationResponse
export type WorkspaceInvitation = WorkspaceInvitationResponse
export type ProjectInvitation = ProjectInvitationResponse

// API response types
export interface ApiResponse<T> {
  data: T;
  status: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

export interface ApiError {
  status: number;
  detail: string;
}
