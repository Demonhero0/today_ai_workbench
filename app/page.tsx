"use client";

import type { DragEvent, FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type TaskStatus = "todo" | "doing" | "waiting" | "done";
type Priority = "high" | "medium" | "low";
type View = "today" | "meetings" | "projects" | "trash";
type EventKind = "meeting" | "focus" | "admin";
type DetailTarget = { kind: "task" | "event" | "project"; id: string } | null;
type ChatMessage = { role: "user" | "assistant"; content: string };
type TimelineScale = "week" | "month";
type TimelineDragItem = { kind: "task" | "event"; id: string };
type AiAction =
  | { type: "create_project"; name: string; goal?: string }
  | { type: "create_meeting"; title: string; date: string; start: string; end: string; project?: string; note?: string }
  | { type: "create_task"; title: string; project?: string; dueDate?: string; priority?: Priority; note?: string }
  | { type: "update_task_status"; title: string; status: TaskStatus };
type AiPayload = { text?: string; suggestions?: string[]; actions?: AiAction[]; error?: string };

type Task = {
  id: string;
  title: string;
  projectId: string;
  due: string;
  dueDate?: string;
  status: TaskStatus;
  priority: Priority;
  note: string;
  createdAt: string;
  deletedAt?: string;
};

type Project = {
  id: string;
  name: string;
  goal: string;
  phase: string;
  status: "active" | "waiting" | "slow" | "healthy";
  updatedAt: string;
  nextAction: string;
  log: string[];
  archivedAt?: string;
};

type CalendarEvent = {
  id: string;
  title: string;
  projectId: string;
  startAt: string;
  endAt: string;
  kind: EventKind;
  note: string;
};

type WorkbenchData = {
  tasks: Task[];
  projects: Project[];
  events: CalendarEvent[];
};

const inboxProjectId = "inbox";
const todayLabel = getTodayLabel();

const inboxProject: Project = {
  id: inboxProjectId,
  name: "Inbox / 未归类",
  goal: "临时收纳还没有项目归属的任务",
  phase: "收件箱",
  status: "active",
  updatedAt: "今天",
  nextAction: "把任务分配到具体项目",
  log: ["今天 · 用于收纳未归类任务"],
};

const starterData: WorkbenchData = {
  projects: [inboxProject],
  tasks: [],
  events: [],
};

const statusLabels: Record<TaskStatus, string> = {
  todo: "待做",
  doing: "进行中",
  waiting: "等待",
  done: "完成",
};

const priorityLabels: Record<Priority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const projectStatusLabels: Record<Project["status"], string> = {
  active: "进行中",
  waiting: "等待",
  slow: "慢推进",
  healthy: "正常",
};

const priorityWeight: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

const saveStateLabels = {
  idle: "等待保存到挂载数据文件",
  saving: "正在保存到挂载数据文件",
  saved: "已保存到挂载数据文件",
  error: "数据文件暂时不可用",
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeData(data: WorkbenchData): WorkbenchData {
  const hasInbox = data.projects.some((project) => project.id === inboxProjectId);
  const projects = hasInbox ? data.projects : [inboxProject, ...data.projects];
  const projectIds = new Set(projects.map((project) => project.id));
  return {
    projects: projects.map((project) => ({
      ...project,
      archivedAt: project.archivedAt,
    })),
    events: data.events.map((event) => {
      const legacyEvent = event as CalendarEvent & { start?: number; end?: number; kind?: EventKind | "deep" };
      return {
        ...event,
        projectId: projectIds.has(event.projectId) ? event.projectId : inboxProjectId,
        startAt: event.startAt ?? `${todayLabel}T${hourNumberToTime(legacyEvent.start ?? 9)}`,
        endAt: event.endAt ?? `${todayLabel}T${hourNumberToTime(legacyEvent.end ?? 10)}`,
        kind: legacyEvent.kind === "deep" ? "focus" : legacyEvent.kind ?? "meeting",
        note: event.note ?? "",
      };
    }),
    tasks: data.tasks.map((task) => ({
      ...task,
      projectId: projectIds.has(task.projectId) ? task.projectId : inboxProjectId,
      dueDate: task.dueDate ?? inferDueDate(task.due),
      note: task.note ?? "",
      deletedAt: task.deletedAt,
    })),
  };
}

function inferDueDate(text: string) {
  if (text.includes("今天")) return todayLabel;
  if (text.includes("明天")) return addDays(todayLabel, 1);
  if (text.includes("本周")) return weekDatesFor(todayLabel)[4];
  return "";
}

function formatDue(task: Task) {
  return task.dueDate || task.due || "未定";
}

function hourNumberToTime(hour: number) {
  const fullHour = Math.floor(hour);
  const minutes = Math.round((hour - fullHour) * 60);
  return `${String(fullHour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function dateInputFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayLabel() {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateFromInput(dateText: string) {
  return new Date(`${dateText}T00:00:00`);
}

function addDays(dateText: string, days: number) {
  const date = dateFromInput(dateText);
  date.setDate(date.getDate() + days);
  return dateInputFromDate(date);
}

function addMonths(dateText: string, months: number) {
  const date = dateFromInput(dateText);
  date.setMonth(date.getMonth() + months);
  return dateInputFromDate(date);
}

function weekDatesFor(dateText: string) {
  const date = dateFromInput(dateText);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return Array.from({ length: 7 }, (_, index) => addDays(dateInputFromDate(date), mondayOffset + index));
}

function monthDatesFor(dateText: string) {
  const date = dateFromInput(dateText);
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const startDay = monthStart.getDay();
  const mondayOffset = startDay === 0 ? -6 : 1 - startDay;
  const gridStart = dateInputFromDate(new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate() + mondayOffset));
  const totalDays = Math.ceil((monthEnd.getDate() - mondayOffset) / 7) * 7;
  return Array.from({ length: totalDays }, (_, index) => addDays(gridStart, index));
}

function formatWeekDay(dateText: string) {
  const date = dateFromInput(dateText);
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${date.getMonth() + 1}/${date.getDate()} 周${weekdays[date.getDay()]}`;
}

function formatMonth(dateText: string) {
  const date = dateFromInput(dateText);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatWeekRange(dates: string[]) {
  const first = dates[0];
  const last = dates[dates.length - 1];
  return `${first.slice(5)} 至 ${last.slice(5)}`;
}

function eventDate(event: CalendarEvent) {
  return event.startAt.slice(0, 10);
}

function eventTimeRange(event: CalendarEvent) {
  return `${event.startAt.slice(11, 16)}-${event.endAt.slice(11, 16)}`;
}

function eventMinutes(event: CalendarEvent) {
  const start = new Date(event.startAt).getTime();
  const end = new Date(event.endAt).getTime();
  return Math.max(0, Math.round((end - start) / 60000));
}

function normalizeInput(text?: string) {
  return (text ?? "").trim().toLowerCase();
}

function coercePriority(value?: string): Priority {
  return value === "high" || value === "low" || value === "medium" ? value : "medium";
}

function coerceStatus(value?: string): TaskStatus | null {
  return value === "todo" || value === "doing" || value === "waiting" || value === "done" ? value : null;
}

function coerceDate(value?: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value ?? "" : todayLabel;
}

function coerceTime(value: string | undefined, fallback: string) {
  return /^\d{2}:\d{2}$/.test(value ?? "") ? value ?? fallback : fallback;
}

export default function Home() {
  const [data, setData] = useState<WorkbenchData>(normalizeData(starterData));
  const [dataReady, setDataReady] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [view, setView] = useState<View>("today");
  const [selectedProjectId, setSelectedProjectId] = useState(inboxProjectId);
  const [projectName, setProjectName] = useState("");
  const [projectGoal, setProjectGoal] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState(todayLabel);
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>("medium");
  const [newTaskNote, setNewTaskNote] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState(todayLabel);
  const [meetingStart, setMeetingStart] = useState("13:30");
  const [meetingEnd, setMeetingEnd] = useState("14:00");
  const [meetingProjectId, setMeetingProjectId] = useState(inboxProjectId);
  const [meetingNote, setMeetingNote] = useState("");
  const [detailTarget, setDetailTarget] = useState<DetailTarget>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "error">("idle");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [timelineAnchorDate, setTimelineAnchorDate] = useState(todayLabel);
  const [meetingAnchorDate, setMeetingAnchorDate] = useState(todayLabel);
  const [timelineScale, setTimelineScale] = useState<TimelineScale>("week");
  const [meetingScale, setMeetingScale] = useState<TimelineScale>("week");
  const [dragOverDate, setDragOverDate] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const didAutoAnalyzeRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMountedData() {
      try {
        const response = await fetch("/api/workbench", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load data");
        const payload = (await response.json()) as { data?: WorkbenchData | null };
        if (!cancelled && payload.data) {
          const normalized = normalizeData(payload.data);
          setData(normalized);
          setSelectedProjectId(normalized.projects.find((project) => project.id !== inboxProjectId)?.id ?? inboxProjectId);
        }
      } catch {
        if (!cancelled) setSaveState("error");
      } finally {
        if (!cancelled) setDataReady(true);
      }
    }

    loadMountedData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!dataReady) return;

    const saveTimer = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const response = await fetch("/api/workbench", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data }),
        });
        if (!response.ok) throw new Error("Unable to save data");
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 350);

    return () => window.clearTimeout(saveTimer);
  }, [data, dataReady]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMessages, aiState]);

  const projectsById = useMemo(() => {
    return Object.fromEntries(data.projects.map((project) => [project.id, project]));
  }, [data.projects]);

  const visibleProjects = data.projects.filter((project) => !project.archivedAt);
  const archivedProjects = data.projects.filter((project) => project.archivedAt);
  const selectedProject = visibleProjects.find((project) => project.id === selectedProjectId) ?? visibleProjects[0] ?? data.projects[0];
  const realProjects = visibleProjects.filter((project) => project.id !== inboxProjectId);
  const liveTasks = data.tasks.filter((task) => !task.deletedAt);
  const trashedTasks = data.tasks.filter((task) => task.deletedAt);

  const activeTasks = liveTasks.filter((task) => task.status !== "done");
  const todayQueueTasks = [...activeTasks].sort((a, b) => {
    const dateA = a.dueDate || "9999-12-31";
    const dateB = b.dueDate || "9999-12-31";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return priorityWeight[a.priority] - priorityWeight[b.priority];
  });

  const highPriorityTasks = activeTasks.filter((task) => task.priority === "high");
  const waitingProjects = realProjects.filter((project) => project.status === "waiting" || project.status === "slow");
  const doneTasks = liveTasks.filter((task) => task.status === "done");
  const inboxTasks = activeTasks.filter((task) => task.projectId === inboxProjectId);

  function tasksForProject(projectId: string) {
    return liveTasks.filter((task) => task.projectId === projectId);
  }

  function activeTasksForProject(projectId: string) {
    return tasksForProject(projectId).filter((task) => task.status !== "done");
  }

  function nextTaskForProject(projectId: string) {
    return activeTasksForProject(projectId).sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority])[0];
  }

  const selectedProjectTasks = selectedProject ? tasksForProject(selectedProject.id) : [];
  const selectedActiveTasks = selectedProjectTasks.filter((task) => task.status !== "done");
  const selectedDoneTasks = selectedProjectTasks.filter((task) => task.status === "done");
  const weekDates = useMemo(() => (timelineScale === "week" ? weekDatesFor(timelineAnchorDate) : monthDatesFor(timelineAnchorDate)), [timelineAnchorDate, timelineScale]);
  const meetingWeekDates = useMemo(() => (meetingScale === "week" ? weekDatesFor(meetingAnchorDate) : monthDatesFor(meetingAnchorDate)), [meetingAnchorDate, meetingScale]);
  const weekDateSet = useMemo(() => new Set(weekDates), [weekDates]);
  const meetingWeekDateSet = useMemo(() => new Set(meetingWeekDates), [meetingWeekDates]);
  const weekSchedule = weekDates.map((date) => {
    const dayEvents = data.events
      .filter((event) => eventDate(event) === date)
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    const dayTasks = liveTasks
      .filter((task) => task.dueDate === date)
      .sort((a, b) => {
        if (a.status === "done" && b.status !== "done") return 1;
        if (a.status !== "done" && b.status === "done") return -1;
        return priorityWeight[a.priority] - priorityWeight[b.priority];
      });
    const eventLoad = dayEvents.reduce((total, event) => total + eventMinutes(event), 0);
    const loadRatio = Math.min(100, Math.round((eventLoad / 420) * 100 + dayTasks.length * 10));
    return { date, events: dayEvents, tasks: dayTasks, eventLoad, loadRatio };
  });
  const meetingSchedule = meetingWeekDates.map((date) => ({
    date,
    events: data.events
      .filter((event) => event.kind === "meeting" && eventDate(event) === date)
      .sort((a, b) => a.startAt.localeCompare(b.startAt)),
  }));
  const weekTaskCount = liveTasks.filter((task) => task.dueDate && weekDateSet.has(task.dueDate)).length;
  const weekMeetingCount = data.events.filter((event) => event.kind === "meeting" && weekDateSet.has(eventDate(event))).length;
  const meetingWeekMeetingCount = data.events.filter((event) => event.kind === "meeting" && meetingWeekDateSet.has(eventDate(event))).length;
  const timelineRangeLabel = timelineScale === "week" ? formatWeekRange(weekDates) : formatMonth(timelineAnchorDate);
  const meetingRangeLabel = meetingScale === "week" ? formatWeekRange(meetingWeekDates) : formatMonth(meetingAnchorDate);
  const detailTask = detailTarget?.kind === "task" ? data.tasks.find((task) => task.id === detailTarget.id) : undefined;
  const detailEvent = detailTarget?.kind === "event" ? data.events.find((event) => event.id === detailTarget.id) : undefined;
  const detailProject = detailTarget?.kind === "project" ? data.projects.find((project) => project.id === detailTarget.id) : undefined;

  const localSuggestions = [
    highPriorityTasks.length
      ? `优先处理 ${highPriorityTasks[0].title}，它是当前最高风险动作。`
      : "今天没有高优先级任务，可以安排一段维护性整理。",
    waitingProjects.length
      ? `${waitingProjects[0].name} 处于${waitingProjects[0].phase}，建议推进下一步：${nextTaskForProject(waitingProjects[0].id)?.title ?? "补一个可执行 Todo"}。`
      : "所有项目都有近期进展，适合补齐下一步动作和截止日期。",
    inboxTasks.length
      ? `Inbox 里还有 ${inboxTasks.length} 个未归类任务，建议先分配到具体项目。`
      : "15:00-16:30 是今天最长空档，适合放 60 分钟以上的深度任务。",
  ];

  function updateTask(taskId: string, patch: Partial<Task>) {
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
    }));
  }

  function updateEvent(eventId: string, patch: Partial<CalendarEvent>) {
    setData((current) => ({
      ...current,
      events: current.events.map((event) => (event.id === eventId ? { ...event, ...patch } : event)),
    }));
  }

  function updateProject(projectId: string, patch: Partial<Project>) {
    setData((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              ...patch,
              updatedAt: "刚刚",
            }
          : project,
      ),
    }));
  }

  function startTimelineDrag(event: DragEvent, item: TimelineDragItem) {
    const payload = JSON.stringify(item);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/json", payload);
    event.dataTransfer.setData("text/plain", payload);
  }

  function handleTimelineDragOver(event: DragEvent, date: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragOverDate !== date) setDragOverDate(date);
  }

  function leaveTimelineDay(event: DragEvent, date: string) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    if (dragOverDate === date) setDragOverDate("");
  }

  function dropTimelineItem(event: DragEvent, date: string) {
    event.preventDefault();
    setDragOverDate("");
    try {
      const item = JSON.parse(event.dataTransfer.getData("application/json") || event.dataTransfer.getData("text/plain")) as TimelineDragItem;
      if (item.kind === "task") {
        updateTask(item.id, { dueDate: date, due: date });
        return;
      }
      if (item.kind === "event") {
        const targetEvent = data.events.find((calendarEvent) => calendarEvent.id === item.id);
        if (!targetEvent) return;
        updateEvent(item.id, {
          startAt: `${date}T${targetEvent.startAt.slice(11, 16)}`,
          endAt: `${date}T${targetEvent.endAt.slice(11, 16)}`,
        });
      }
    } catch {
      setDragOverDate("");
    }
  }

  function deleteTask(taskId: string) {
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, deletedAt: new Date().toISOString() } : task)),
    }));
  }

  function restoreTask(taskId: string) {
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, deletedAt: undefined } : task)),
    }));
  }

  function permanentlyDeleteTask(taskId: string) {
    setData((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== taskId),
    }));
  }

  function addProject(event: FormEvent) {
    event.preventDefault();
    const name = projectName.trim();
    if (!name) return;
    const id = makeId("project");
    const project: Project = {
      id,
      name,
      goal: projectGoal.trim() || "先明确目标和下一步动作",
      phase: "刚开始",
      status: "active",
      updatedAt: "刚刚",
      nextAction: "写下第一个可执行动作",
      log: ["刚刚 · 新建项目"],
    };
    setData((current) => {
      const inbox = current.projects.find((item) => item.id === inboxProjectId);
      const rest = current.projects.filter((item) => item.id !== inboxProjectId);
      return { ...current, projects: inbox ? [inbox, project, ...rest] : [project, ...rest] };
    });
    setProjectName("");
    setProjectGoal("");
    setSelectedProjectId(id);
    setView("projects");
  }

  function archiveProject(projectId: string) {
    if (projectId === inboxProjectId) return;
    const fallbackProject = visibleProjects.find((project) => project.id !== projectId) ?? visibleProjects[0];
    setData((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              archivedAt: new Date().toISOString(),
              updatedAt: "刚刚",
              log: [`刚刚 · 项目已归档`, ...project.log].slice(0, 5),
            }
          : project,
      ),
    }));
    if (selectedProjectId === projectId && fallbackProject) setSelectedProjectId(fallbackProject.id);
  }

  function restoreProject(projectId: string) {
    setData((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              archivedAt: undefined,
              updatedAt: "刚刚",
              log: [`刚刚 · 项目已恢复`, ...project.log].slice(0, 5),
            }
          : project,
      ),
    }));
    setSelectedProjectId(projectId);
  }

  function addTaskToProject(event: FormEvent) {
    event.preventDefault();
    const title = newTaskTitle.trim();
    if (!title || !selectedProject) return;

    const task: Task = {
      id: makeId("task"),
      title,
      projectId: selectedProject.id,
      due: newTaskDueDate || "未定",
      dueDate: newTaskDueDate,
      status: "todo",
      priority: newTaskPriority,
      note: newTaskNote.trim(),
      createdAt: todayLabel,
    };

    setData((current) => ({
      ...current,
      tasks: [task, ...current.tasks],
      projects: current.projects.map((project) =>
        project.id === selectedProject.id
          ? {
              ...project,
              updatedAt: "刚刚",
              nextAction: task.title,
              log: [`刚刚 · 新增任务：${task.title}`, ...project.log].slice(0, 5),
            }
          : project,
      ),
    }));
    setNewTaskTitle("");
    setNewTaskDueDate(todayLabel);
    setNewTaskPriority("medium");
    setNewTaskNote("");
  }

  function addMeeting(event: FormEvent) {
    event.preventDefault();
    const title = meetingTitle.trim();
    if (!title || !meetingDate || !meetingStart || !meetingEnd) return;

    const meeting: CalendarEvent = {
      id: makeId("event"),
      title,
      projectId: meetingProjectId,
      startAt: `${meetingDate}T${meetingStart}`,
      endAt: `${meetingDate}T${meetingEnd}`,
      kind: "meeting",
      note: meetingNote.trim(),
    };

    setData((current) => ({
      ...current,
      events: [meeting, ...current.events],
    }));
    setMeetingTitle("");
    setMeetingNote("");
  }

  function applyAiActions(actions: AiAction[]) {
    if (!actions.length) return "";

    const nextData: WorkbenchData = {
      projects: [...data.projects],
      tasks: [...data.tasks],
      events: [...data.events],
    };
    const applied: string[] = [];
    let nextSelectedProjectId = selectedProjectId;

    function projectByName(name?: string) {
      const normalizedName = normalizeInput(name);
      if (!normalizedName) return nextData.projects.find((project) => project.id === inboxProjectId) ?? inboxProject;
      return (
        nextData.projects.find((project) => normalizeInput(project.name) === normalizedName) ??
        nextData.projects.find((project) => normalizeInput(project.name).includes(normalizedName)) ??
        nextData.projects.find((project) => project.id === inboxProjectId) ??
        inboxProject
      );
    }

    function addProjectFromAction(name: string, goal?: string) {
      const trimmedName = name.trim();
      if (!trimmedName) return null;
      const existingProject = nextData.projects.find((project) => normalizeInput(project.name) === normalizeInput(trimmedName));
      if (existingProject) return existingProject;
      const project: Project = {
        id: makeId("project"),
        name: trimmedName,
        goal: goal?.trim() || "先明确目标和下一步动作",
        phase: "刚开始",
        status: "active",
        updatedAt: "刚刚",
        nextAction: "写下第一个可执行动作",
        log: ["刚刚 · 由 AI 创建项目"],
      };
      const inbox = nextData.projects.find((item) => item.id === inboxProjectId);
      const rest = nextData.projects.filter((item) => item.id !== inboxProjectId);
      nextData.projects = inbox ? [inbox, project, ...rest] : [project, ...rest];
      applied.push(`创建项目：${project.name}`);
      nextSelectedProjectId = project.id;
      return project;
    }

    actions.forEach((action) => {
      if (action.type === "create_project") {
        addProjectFromAction(action.name, action.goal);
        return;
      }

      if (action.type === "create_task") {
        const title = action.title?.trim();
        if (!title) return;
        const project = projectByName(action.project);
        const dueDate = action.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(action.dueDate) ? action.dueDate : "";
        const task: Task = {
          id: makeId("task"),
          title,
          projectId: project.id,
          due: dueDate || "未定",
          dueDate,
          status: "todo",
          priority: coercePriority(action.priority),
          note: action.note?.trim() ?? "",
          createdAt: todayLabel,
        };
        nextData.tasks = [task, ...nextData.tasks];
        nextData.projects = nextData.projects.map((item) =>
          item.id === project.id
            ? {
                ...item,
                updatedAt: "刚刚",
                nextAction: task.title,
                log: [`刚刚 · AI 新增 Todo：${task.title}`, ...item.log].slice(0, 5),
              }
            : item,
        );
        applied.push(`创建 Todo：${task.title}`);
        nextSelectedProjectId = project.id;
        return;
      }

      if (action.type === "create_meeting") {
        const title = action.title?.trim();
        if (!title) return;
        const date = coerceDate(action.date);
        const start = coerceTime(action.start, "13:30");
        const end = coerceTime(action.end, "14:00");
        const project = projectByName(action.project);
        const meeting: CalendarEvent = {
          id: makeId("event"),
          title,
          projectId: project.id,
          startAt: `${date}T${start}`,
          endAt: `${date}T${end}`,
          kind: "meeting",
          note: action.note?.trim() ?? "",
        };
        nextData.events = [meeting, ...nextData.events];
        applied.push(`创建会议：${meeting.title} ${date} ${start}-${end}`);
        return;
      }

      if (action.type === "update_task_status") {
        const status = coerceStatus(action.status);
        const targetTitle = normalizeInput(action.title);
        if (!status || !targetTitle) return;
        const task = nextData.tasks.find((item) => !item.deletedAt && normalizeInput(item.title).includes(targetTitle));
        if (!task) return;
        nextData.tasks = nextData.tasks.map((item) => (item.id === task.id ? { ...item, status } : item));
        applied.push(`更新 Todo 状态：${task.title} -> ${statusLabels[status]}`);
      }
    });

    if (!applied.length) return "";
    setData(normalizeData(nextData));
    setSelectedProjectId(nextSelectedProjectId);
    return `\n\n已执行：\n${applied.map((item) => `- ${item}`).join("\n")}`;
  }

  async function requestAi(mode: "suggestions" | "chat" | "command", message?: string, messages: ChatMessage[] = chatMessages) {
    setAiState("loading");
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, message, messages, data }),
      });
      const payload = (await response.json()) as AiPayload;
      if (!response.ok) throw new Error(payload.error ?? "LLM 暂时不可用");
      setAiState("idle");
      return payload;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "LLM 暂时不可用";
      setAiState("error");
      return { error: messageText };
    }
  }

  async function analyzeTodayWithLlm() {
    const payload = await requestAi("suggestions");
    if (payload.error) {
      setChatMessages((current) => [...current, { role: "assistant", content: `今天建议生成失败：${payload.error}` }]);
      return;
    }
    const suggestions = payload.suggestions?.length ? payload.suggestions : localSuggestions;
    setChatMessages((current) => [
      ...current,
      {
        role: "assistant",
        content: `你可以问我本周有什么风险，也可以直接说：创建项目、创建会议、添加 Todo，能执行的我会帮你写进今天。\n\n今天建议：\n${suggestions.map((suggestion) => `- ${suggestion}`).join("\n")}`,
      },
    ]);
  }

  async function sendChatMessage(event: FormEvent) {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || aiState === "loading") return;
    const nextMessages: ChatMessage[] = [...chatMessages, { role: "user", content: message }];
    setChatMessages(nextMessages);
    setChatInput("");
    const payload = await requestAi("command", message, nextMessages);
    const actionSummary = payload.actions?.length ? applyAiActions(payload.actions) : "";
    setChatMessages((current) => [...current, { role: "assistant", content: `${payload.text ?? payload.error ?? "我这边暂时没拿到回复。"}${actionSummary}` }]);
  }

  useEffect(() => {
    if (!dataReady || didAutoAnalyzeRef.current) return;
    didAutoAnalyzeRef.current = true;
    void analyzeTodayWithLlm();
    // Run once per page load; normal edits should not keep retriggering LLM calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady]);

  const isTrashView = view === "trash";

  return (
    <main className="workbench">
      <aside className="sidebar" aria-label="工作台导航">
        <div className="brand">
          <span className="brand-mark">A</span>
          <div>
            <strong>今天</strong>
            <small>个人状态图谱</small>
          </div>
        </div>
        <nav className="nav">
          {[
            ["today", "今天"],
            ["meetings", "会议"],
            ["projects", "项目"],
            ["trash", `回收站 ${trashedTasks.length ? `(${trashedTasks.length})` : ""}`],
          ].map(([key, label]) => (
            <button key={key} className={view === key ? "active" : ""} type="button" onClick={() => setView(key as View)}>
              {label}
            </button>
          ))}
        </nav>
        <section className="sidebar-metrics" aria-label="工作台概览">
          <Metric label="今天待办" value={activeTasks.length.toString()} hint={`${highPriorityTasks.length} 个高优先级`} />
          <Metric label="项目" value={realProjects.length.toString()} hint={`${waitingProjects.length} 个需要关注`} />
          <Metric label="Inbox" value={inboxTasks.length.toString()} hint="未归类任务" />
          <Metric label="已完成" value={doneTasks.length.toString()} hint="沉淀进展" />
        </section>
      </aside>

      <section className="content">
        {isTrashView ? (
          <div className="dashboard-grid">
            <section className="panel wide">
              <div className="panel-head">
                <h2>回收站</h2>
                <span>{trashedTasks.length} 个已删除 Todo · {dataReady ? saveStateLabels[saveState] : "正在读取挂载数据文件"}</span>
              </div>
              <div className="task-list">
                {trashedTasks.map((task) => (
                  <TrashTaskRow
                    key={task.id}
                    task={task}
                    projectsById={projectsById}
                    onRestore={restoreTask}
                    onPermanentDelete={permanentlyDeleteTask}
                  />
                ))}
                {!trashedTasks.length && <p className="empty-state">回收站是空的。</p>}
              </div>
            </section>
          </div>
        ) : view === "today" ? (
          <>
            <header className="hero">
              <div>
                <p>{formatWeekDay(todayLabel)}</p>
                <h1>今天把哪些事推进一点点？</h1>
                <span className={`save-state ${saveState}`}>{dataReady ? saveStateLabels[saveState] : "正在读取挂载数据文件"}</span>
              </div>
            </header>

          </>
        ) : null}

        {view === "today" && (
          <div className="dashboard-grid today-dashboard">
            <section className="panel chat-panel">
              <div className="panel-head">
                <h2>AI Chat</h2>
                <span>基于当前项目、Todo、会议和归档状态回答</span>
              </div>
              <div className="chat-log">
                {chatMessages.map((message, index) => (
                  <article className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                    <strong>{message.role === "user" ? "我" : "AI"}</strong>
                    <p>{message.content}</p>
                  </article>
                ))}
                {aiState === "loading" && (
                  <article className="chat-message assistant">
                    <strong>AI</strong>
                    <p>正在分析...</p>
                  </article>
                )}
                <div ref={chatEndRef} />
              </div>
              <form className="chat-composer" onSubmit={sendChatMessage}>
                <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="问问你的工作台，例如：这周哪个项目风险最高？" />
                <button type="submit" disabled={aiState === "loading" || !chatInput.trim()}>
                  发送
                </button>
              </form>
            </section>

            <section className="panel today-queue-panel">
              <div className="panel-head">
                <h2>任务队列</h2>
                <span>{activeTasks.length} 个未完成</span>
              </div>
              <div className="task-list">
                {todayQueueTasks.map((task) => (
                  <TodayTaskRow
                    key={task.id}
                    task={task}
                    projectsById={projectsById}
                    onStatusChange={(status) => updateTask(task.id, { status })}
                  />
                ))}
                {!liveTasks.length && <p className="empty-state">还没有 Todo。可以在项目页添加，或对 AI 说“添加 Todo：整理周计划”。</p>}
              </div>
            </section>

            <section className="panel timeline-panel wide">
              <div className="panel-head">
                <div>
                  <h2>{timelineScale === "week" ? "周时间轴" : "月时间轴"}</h2>
                  <span>{timelineRangeLabel} · {weekTaskCount} 个 Todo · {weekMeetingCount} 个会议</span>
                </div>
                <div className="week-controls">
                  <button className={`secondary ${timelineScale === "week" ? "active" : ""}`} type="button" onClick={() => setTimelineScale("week")}>
                    周
                  </button>
                  <button className={`secondary ${timelineScale === "month" ? "active" : ""}`} type="button" onClick={() => setTimelineScale("month")}>
                    月
                  </button>
                  <button className="secondary" type="button" onClick={() => setTimelineAnchorDate(timelineScale === "week" ? addDays(timelineAnchorDate, -7) : addMonths(timelineAnchorDate, -1))}>
                    上{timelineScale === "week" ? "一周" : "一月"}
                  </button>
                  <button className="secondary" type="button" onClick={() => setTimelineAnchorDate(todayLabel)}>
                    {timelineScale === "week" ? "本周" : "本月"}
                  </button>
                  <button className="secondary" type="button" onClick={() => setTimelineAnchorDate(timelineScale === "week" ? addDays(timelineAnchorDate, 7) : addMonths(timelineAnchorDate, 1))}>
                    下{timelineScale === "week" ? "一周" : "一月"}
                  </button>
                </div>
              </div>
              <div className={`week-timeline ${timelineScale === "month" ? "month-view" : ""}`}>
                {weekSchedule.map((day) => (
                  <article
                    className={`week-day ${day.date === todayLabel ? "today" : ""} ${dragOverDate === day.date ? "drag-over" : ""}`}
                    key={day.date}
                    onDragOver={(event) => handleTimelineDragOver(event, day.date)}
                    onDragLeave={(event) => leaveTimelineDay(event, day.date)}
                    onDrop={(event) => dropTimelineItem(event, day.date)}
                  >
                    <header>
                      <div>
                        <strong>{formatWeekDay(day.date)}</strong>
                        <small>{day.eventLoad} 分钟日程 · {day.tasks.length} 个 Todo</small>
                      </div>
                      <span>{day.events.length + day.tasks.length}</span>
                    </header>
                    <div className="load-bar" aria-label={`${day.date} 负载`}>
                      <i style={{ width: `${day.loadRatio}%` }} />
                    </div>
                    <div className="week-items">
                      {day.events.map((event) => (
                        <button
                          className={`week-item ${event.kind}`}
                          draggable
                          key={event.id}
                          type="button"
                          onDragStart={(dragEvent) => startTimelineDrag(dragEvent, { kind: "event", id: event.id })}
                          onDragEnd={() => setDragOverDate("")}
                          onClick={() => {
                            setSelectedProjectId(event.projectId);
                            setDetailTarget({ kind: "event", id: event.id });
                          }}
                        >
                          <strong>{event.title}</strong>
                          <span><em className="time-chip">{eventTimeRange(event)}</em> {projectsById[event.projectId]?.name ?? "Inbox / 未归类"}</span>
                        </button>
                      ))}
                      {day.tasks.map((task) => (
                        <button
                          className={`week-item todo ${task.priority} ${task.status === "done" ? "done" : ""}`}
                          draggable
                          key={task.id}
                          type="button"
                          onDragStart={(dragEvent) => startTimelineDrag(dragEvent, { kind: "task", id: task.id })}
                          onDragEnd={() => setDragOverDate("")}
                          onClick={() => {
                            setSelectedProjectId(task.projectId);
                            setDetailTarget({ kind: "task", id: task.id });
                          }}
                        >
                          <strong>{task.title}</strong>
                          <span>{task.status === "done" ? "已完成" : "Todo"} · {projectsById[task.projectId]?.name ?? "Inbox / 未归类"}</span>
                        </button>
                      ))}
                      {!day.events.length && !day.tasks.length && <p className="empty-state">暂无安排</p>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {view === "meetings" && (
          <div className="dashboard-grid meetings-page">
            <section className="panel compact-panel meeting-create-panel">
              <div className="panel-head">
                <h2>创建会议</h2>
                <span>{meetingWeekMeetingCount} 个当前视图会议</span>
              </div>
              <form className="meeting-composer" onSubmit={addMeeting}>
                <label>
                  会议主题
                  <input value={meetingTitle} onChange={(event) => setMeetingTitle(event.target.value)} placeholder="例如：项目同步会" />
                </label>
                <label>
                  日期
                  <input type="date" value={meetingDate} onChange={(event) => setMeetingDate(event.target.value)} />
                </label>
                <label>
                  开始
                  <input type="time" value={meetingStart} onChange={(event) => setMeetingStart(event.target.value)} />
                </label>
                <label>
                  结束
                  <input type="time" value={meetingEnd} onChange={(event) => setMeetingEnd(event.target.value)} />
                </label>
                <label>
                  关联项目
                  <select value={meetingProjectId} onChange={(event) => setMeetingProjectId(event.target.value)}>
                    {visibleProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  备注
                  <input value={meetingNote} onChange={(event) => setMeetingNote(event.target.value)} placeholder="可选" />
                </label>
                <button type="submit">添加会议</button>
              </form>
            </section>

            <section className="panel compact-panel meeting-timeline-panel">
              <div className="panel-head">
                <div>
                  <h2>{meetingScale === "week" ? "会议时间轴" : "会议月视图"}</h2>
                  <span>{meetingRangeLabel} · {meetingWeekMeetingCount} 个会议</span>
                </div>
                <div className="week-controls">
                  <button className={`secondary ${meetingScale === "week" ? "active" : ""}`} type="button" onClick={() => setMeetingScale("week")}>
                    周
                  </button>
                  <button className={`secondary ${meetingScale === "month" ? "active" : ""}`} type="button" onClick={() => setMeetingScale("month")}>
                    月
                  </button>
                  <button className="secondary" type="button" onClick={() => setMeetingAnchorDate(meetingScale === "week" ? addDays(meetingAnchorDate, -7) : addMonths(meetingAnchorDate, -1))}>
                    上{meetingScale === "week" ? "一周" : "一月"}
                  </button>
                  <button className="secondary" type="button" onClick={() => setMeetingAnchorDate(todayLabel)}>
                    {meetingScale === "week" ? "本周" : "本月"}
                  </button>
                  <button className="secondary" type="button" onClick={() => setMeetingAnchorDate(meetingScale === "week" ? addDays(meetingAnchorDate, 7) : addMonths(meetingAnchorDate, 1))}>
                    下{meetingScale === "week" ? "一周" : "一月"}
                  </button>
                </div>
              </div>
              <div className={`week-timeline ${meetingScale === "month" ? "month-view" : ""}`}>
                {meetingSchedule.map((day) => (
                  <article
                    className={`week-day ${day.date === todayLabel ? "today" : ""} ${dragOverDate === day.date ? "drag-over" : ""}`}
                    key={day.date}
                    onDragOver={(event) => handleTimelineDragOver(event, day.date)}
                    onDragLeave={(event) => leaveTimelineDay(event, day.date)}
                    onDrop={(event) => dropTimelineItem(event, day.date)}
                  >
                    <header>
                      <div>
                        <strong>{formatWeekDay(day.date)}</strong>
                        <small>{day.events.reduce((total, event) => total + eventMinutes(event), 0)} 分钟会议</small>
                      </div>
                      <span>{day.events.length}</span>
                    </header>
                    <div className="week-items">
                      {day.events.map((event) => (
                        <button
                          className="week-item meeting"
                          draggable
                          key={event.id}
                          type="button"
                          onDragStart={(dragEvent) => startTimelineDrag(dragEvent, { kind: "event", id: event.id })}
                          onDragEnd={() => setDragOverDate("")}
                          onClick={() => {
                            setSelectedProjectId(event.projectId);
                            setDetailTarget({ kind: "event", id: event.id });
                          }}
                        >
                          <strong>{event.title}</strong>
                          <span><em className="time-chip">{eventTimeRange(event)}</em> {projectsById[event.projectId]?.name ?? "Inbox / 未归类"}</span>
                        </button>
                      ))}
                      {!day.events.length && <p className="empty-state">暂无会议</p>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {view === "projects" && selectedProject && (
          <div className="project-page">
            <section className="panel project-create-panel">
              <div className="panel-head">
                <h2>创建项目</h2>
                <span>{realProjects.length} 个项目 · {archivedProjects.length} 个已归档 · {inboxTasks.length} 个未归类</span>
              </div>
              <form className="project-composer inline" onSubmit={addProject}>
                <label>
                  新项目
                  <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="例如：搬家计划" />
                </label>
                <label>
                  目标
                  <input value={projectGoal} onChange={(event) => setProjectGoal(event.target.value)} placeholder="先写一句目标" />
                </label>
                <button type="submit">添加项目</button>
              </form>
            </section>

            <div className="project-workspace">
              <section className="panel project-board">
              <div className="panel-head">
                <h2>项目看板</h2>
                <span>{selectedProject.name}</span>
              </div>
              <div className="project-list">
                {visibleProjects.map((project) => {
                  const activeCount = activeTasksForProject(project.id).length;
                  const nextTask = nextTaskForProject(project.id);
                  return (
                    <button
                      className={`project-card ${selectedProject.id === project.id ? "selected" : ""} ${project.id === inboxProjectId ? "inbox" : ""}`}
                      key={project.id}
                      type="button"
                      onClick={() => setSelectedProjectId(project.id)}
                    >
                      <span>
                        <strong>{project.name}</strong>
                        <small>{project.phase} · {activeCount} 个未完成</small>
                        <small>下一步：{nextTask?.title ?? "暂无"}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
              {archivedProjects.length > 0 && (
                <details className="archive-section">
                  <summary>已归档项目 {archivedProjects.length} 个</summary>
                  <div className="archive-list">
                    {archivedProjects.map((project) => (
                      <button className="archive-project" type="button" key={project.id} onClick={() => restoreProject(project.id)}>
                        <span>
                          <strong>{project.name}</strong>
                          <small>{project.archivedAt ? new Date(project.archivedAt).toLocaleDateString("zh-CN") : "已归档"}</small>
                        </span>
                        <em>恢复</em>
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </section>

            <section className="panel project-todo-panel">
              <div className="panel-head">
                <h2>项目 Todo</h2>
                <div className="panel-actions">
                  <span>{selectedProject.name} · {selectedActiveTasks.length} 个未完成</span>
                  {selectedProject.id !== inboxProjectId && (
                    <>
                      <button className="secondary" type="button" onClick={() => setDetailTarget({ kind: "project", id: selectedProject.id })}>
                        编辑项目
                      </button>
                      <button className="secondary" type="button" onClick={() => archiveProject(selectedProject.id)}>
                        归档项目
                      </button>
                    </>
                  )}
                </div>
              </div>
              <form className="task-composer" onSubmit={addTaskToProject}>
                <label>
                  新 Todo
                  <input value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} placeholder="写下一个可执行动作" />
                </label>
                <label>
                  截止日期
                  <input type="date" value={newTaskDueDate} onChange={(event) => setNewTaskDueDate(event.target.value)} />
                </label>
                <label>
                  优先级
                  <select value={newTaskPriority} onChange={(event) => setNewTaskPriority(event.target.value as Priority)}>
                    {Object.entries(priorityLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="task-note-field">
                  备注
                  <input value={newTaskNote} onChange={(event) => setNewTaskNote(event.target.value)} placeholder="可选" />
                </label>
                <button type="submit">添加</button>
              </form>
              <div className="task-list">
                {selectedActiveTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    projects={visibleProjects}
                    projectsById={projectsById}
                    onDelete={deleteTask}
                    onUpdate={updateTask}
                    deleteLabel="移入回收站"
                    canChangeProject={false}
                    onOpen={() => setDetailTarget({ kind: "task", id: task.id })}
                  />
                ))}
                {!selectedActiveTasks.length && <p className="empty-state">这个项目暂时没有未完成 Todo。</p>}
              </div>

              <details className="done-section">
                <summary>已完成 {selectedDoneTasks.length} 个</summary>
                <div className="task-list compact">
                  {selectedDoneTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      projects={visibleProjects}
                    projectsById={projectsById}
                    onDelete={deleteTask}
                    onUpdate={updateTask}
                    deleteLabel="移入回收站"
                    canChangeProject={false}
                    onOpen={() => setDetailTarget({ kind: "task", id: task.id })}
                  />
                ))}
                  {!selectedDoneTasks.length && <p className="empty-state">还没有完成项。</p>}
                </div>
              </details>
            </section>
            </div>
          </div>
        )}

        {detailProject && (
          <DetailModal title="项目详情" onClose={() => setDetailTarget(null)}>
            <div className="detail-form">
              <label>
                项目名称
                <input value={detailProject.name} onChange={(event) => updateProject(detailProject.id, { name: event.target.value })} />
              </label>
              <label>
                状态
                <select value={detailProject.status} onChange={(event) => updateProject(detailProject.id, { status: event.target.value as Project["status"] })}>
                  {Object.entries(projectStatusLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                阶段
                <input value={detailProject.phase} onChange={(event) => updateProject(detailProject.id, { phase: event.target.value })} placeholder="例如：调研中 / 开发中 / 收尾" />
              </label>
              <label>
                下一步
                <input value={detailProject.nextAction} onChange={(event) => updateProject(detailProject.id, { nextAction: event.target.value })} placeholder="写下下一步动作" />
              </label>
              <label className="detail-wide">
                目标
                <textarea value={detailProject.goal} onChange={(event) => updateProject(detailProject.id, { goal: event.target.value })} placeholder="这个项目要达成什么？" />
              </label>
              <div className="detail-meta">
                <span>最近更新 {detailProject.updatedAt}</span>
                {detailProject.id !== inboxProjectId && (
                  <button className="danger-button" type="button" onClick={() => {
                    archiveProject(detailProject.id);
                    setDetailTarget(null);
                  }}>
                    归档项目
                  </button>
                )}
              </div>
            </div>
          </DetailModal>
        )}

        {detailTask && (
          <DetailModal title="Todo 详情" onClose={() => setDetailTarget(null)}>
            <div className="detail-form">
              <label>
                标题
                <input value={detailTask.title} onChange={(event) => updateTask(detailTask.id, { title: event.target.value })} />
              </label>
              <label>
                所属项目
                <select value={detailTask.projectId} onChange={(event) => updateTask(detailTask.id, { projectId: event.target.value })}>
                  {visibleProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                截止日期
                <input type="date" value={detailTask.dueDate ?? ""} onChange={(event) => updateTask(detailTask.id, { dueDate: event.target.value, due: event.target.value || "未定" })} />
              </label>
              <label>
                状态
                <select value={detailTask.status} onChange={(event) => updateTask(detailTask.id, { status: event.target.value as TaskStatus })}>
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                优先级
                <select value={detailTask.priority} onChange={(event) => updateTask(detailTask.id, { priority: event.target.value as Priority })}>
                  {Object.entries(priorityLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="detail-wide">
                备注
                <textarea value={detailTask.note ?? ""} onChange={(event) => updateTask(detailTask.id, { note: event.target.value })} placeholder="补充上下文、结论或待确认事项" />
              </label>
              <div className="detail-meta">
                <span>创建于 {detailTask.createdAt}</span>
                <button className="danger-button" type="button" onClick={() => {
                  deleteTask(detailTask.id);
                  setDetailTarget(null);
                }}>
                  移入回收站
                </button>
              </div>
            </div>
          </DetailModal>
        )}

        {detailEvent && (
          <DetailModal title={detailEvent.kind === "meeting" ? "会议详情" : "日程详情"} onClose={() => setDetailTarget(null)}>
            <div className="detail-form">
              <label>
                主题
                <input value={detailEvent.title} onChange={(event) => updateEvent(detailEvent.id, { title: event.target.value })} />
              </label>
              <label>
                关联项目
                <select value={detailEvent.projectId} onChange={(event) => updateEvent(detailEvent.id, { projectId: event.target.value })}>
                  {visibleProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                日期
                <input
                  type="date"
                  value={eventDate(detailEvent)}
                  onChange={(event) =>
                    updateEvent(detailEvent.id, {
                      startAt: `${event.target.value}T${detailEvent.startAt.slice(11, 16)}`,
                      endAt: `${event.target.value}T${detailEvent.endAt.slice(11, 16)}`,
                    })
                  }
                />
              </label>
              <label>
                开始
                <input type="time" value={detailEvent.startAt.slice(11, 16)} onChange={(event) => updateEvent(detailEvent.id, { startAt: `${eventDate(detailEvent)}T${event.target.value}` })} />
              </label>
              <label>
                结束
                <input type="time" value={detailEvent.endAt.slice(11, 16)} onChange={(event) => updateEvent(detailEvent.id, { endAt: `${eventDate(detailEvent)}T${event.target.value}` })} />
              </label>
              <label className="detail-wide">
                备注
                <textarea value={detailEvent.note} onChange={(event) => updateEvent(detailEvent.id, { note: event.target.value })} placeholder="记录会议结论、纪要或待跟进事项" />
              </label>
            </div>
          </DetailModal>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function DetailModal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="detail-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭详情">
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function TodayTaskRow({
  task,
  projectsById,
  onStatusChange,
}: {
  task: Task;
  projectsById: Record<string, Project>;
  onStatusChange: (status: TaskStatus) => void;
}) {
  return (
    <article className={`today-task ${task.status === "done" ? "done" : ""}`}>
      <div className="today-task-main">
        <strong>{task.title}</strong>
        <p>
          {projectsById[task.projectId]?.name ?? "Inbox / 未归类"} · {formatDue(task)}
        </p>
        {task.note && <small>{task.note}</small>}
      </div>
      <div className="today-task-status">
        <span className={`pill ${task.priority}`}>{priorityLabels[task.priority]}</span>
        <select value={task.status} onChange={(event) => onStatusChange(event.target.value as TaskStatus)} aria-label="任务状态">
          {Object.entries(statusLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}

function TaskRow({
  task,
  projects,
  projectsById,
  onDelete,
  onUpdate,
  deleteLabel = "删除",
  showProject = false,
  canChangeProject = true,
  onOpen,
}: {
  task: Task;
  projects: Project[];
  projectsById: Record<string, Project>;
  onDelete: (taskId: string) => void;
  onUpdate: (taskId: string, patch: Partial<Task>) => void;
  deleteLabel?: string;
  showProject?: boolean;
  canChangeProject?: boolean;
  onOpen?: () => void;
}) {
  return (
    <article
      className={`task ${task.status === "done" ? "done" : ""} ${onOpen ? "clickable" : ""}`}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (!onOpen) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div>
        <strong>{task.title}</strong>
        <p>
          {showProject ? `${projectsById[task.projectId]?.name ?? "Inbox / 未归类"} · ` : ""}
          {formatDue(task)}
        </p>
        <label className="task-note">
          备注
          <input value={task.note ?? ""} onClick={(event) => event.stopPropagation()} onChange={(event) => onUpdate(task.id, { note: event.target.value })} placeholder="补充一点上下文" />
        </label>
      </div>
      <div className="task-actions" onClick={(event) => event.stopPropagation()}>
        {canChangeProject && (
          <select value={task.projectId} onChange={(event) => onUpdate(task.id, { projectId: event.target.value })} aria-label="所属项目">
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        )}
        <input type="date" value={task.dueDate ?? ""} onChange={(event) => onUpdate(task.id, { dueDate: event.target.value, due: event.target.value || "未定" })} aria-label="截止日期" />
        <select value={task.status} onChange={(event) => onUpdate(task.id, { status: event.target.value as TaskStatus })} aria-label="任务状态">
          {Object.entries(statusLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <span className={`pill ${task.priority}`}>{priorityLabels[task.priority]}</span>
        <button className="icon-button" type="button" onClick={() => onDelete(task.id)} aria-label={`${deleteLabel} ${task.title}`}>
          ×
        </button>
      </div>
    </article>
  );
}

function TrashTaskRow({
  task,
  projectsById,
  onRestore,
  onPermanentDelete,
}: {
  task: Task;
  projectsById: Record<string, Project>;
  onRestore: (taskId: string) => void;
  onPermanentDelete: (taskId: string) => void;
}) {
  return (
    <article className="task trash-task">
      <div>
        <strong>{task.title}</strong>
        <p>
          {projectsById[task.projectId]?.name ?? "Inbox / 未归类"} · 删除于 {task.deletedAt ? new Date(task.deletedAt).toLocaleString("zh-CN") : "未知时间"}
        </p>
      </div>
      <div className="task-actions">
        <button className="secondary" type="button" onClick={() => onRestore(task.id)}>
          恢复
        </button>
        <button className="danger-button" type="button" onClick={() => onPermanentDelete(task.id)}>
          永久删除
        </button>
      </div>
    </article>
  );
}
