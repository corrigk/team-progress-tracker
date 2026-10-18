export type Team = {
  id: string;
  name: string;
  course: string;
  objective: string;
  starts_on: string | null;
  ends_on: string | null;
  status: 'active' | 'archived';
  created_at: string;
};

export type Member = {
  id: string;
  team_id: string;
  name: string;
  role: string;
  color: string;
  sort: number;
  created_at: string;
};

export type EventKind = 'deliverable' | 'presentation' | 'meeting' | 'other';

export type TeamEvent = {
  id: string;
  team_id: string;
  title: string;
  kind: EventKind;
  due_at: string;
  location: string;
  notes: string;
  created_at: string;
};

export type TaskStatus = 'todo' | 'doing' | 'done';

export type Task = {
  id: string;
  team_id: string;
  title: string;
  notes: string;
  link: string;
  owner_id: string | null;
  event_id: string | null;
  due_on: string | null;
  status: TaskStatus;
  created_by: string | null;
  done_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Activity = {
  id: number;
  team_id: string;
  member_id: string | null;
  verb: string;
  subject: string;
  created_at: string;
};

export type LessonKind = 'went_well' | 'improve' | 'try';

export type Lesson = {
  id: string;
  team_id: string;
  member_id: string | null;
  kind: LessonKind;
  body: string;
  created_at: string;
};

export type TeamData = {
  team: Team;
  members: Member[];
  events: TeamEvent[];
  tasks: Task[];
  activity: Activity[];
  lessons: Lesson[];
};

/** Board column, derived from status + confirmation. */
export type Column = 'todo' | 'doing' | 'review' | 'confirmed';

export function columnOf(t: Task): Column {
  if (t.status === 'done') return t.confirmed_by ? 'confirmed' : 'review';
  return t.status;
}
