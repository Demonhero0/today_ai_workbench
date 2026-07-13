"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type TaskStatus = "todo" | "doing" | "waiting" | "done";
type Priority = "high" | "medium" | "low";
type View = "today" | "meetings" | "projects" | "trash";
type EventKind = "meeting" | "focus" | "admin";

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
  progress: number;
  updatedAt: string;
  nextAction: string;
  log: string[];
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
const todayLabel = "2026-07-13";

const starterData: WorkbenchData = {
  projects: [
    {
      id: inboxProjectId,
      name: "Inbox / 未归类",
      goal: "临时收纳还没有项目归属的任务",
      phase: "收件箱",
      status: "active",
      progress: 0,
      updatedAt: "今天",
      nextAction: "把任务分配到具体项目",
      log: ["今天 · 用于收纳未归类任务"],
    },
    {
      id: "client",
      name: "客户项目",
      goal: "完成方案评审并收敛交付范围",
      phase: "冲刺中",
      status: "active",
      progress: 78,
      updatedAt: "今天",
      nextAction: "完成方案第 3 版",
      log: ["今天 · 安排 90 分钟深度工作", "7/12 · 完成竞品对比", "7/11 · 收到客户补充需求"],
    },
    {
      id: "visa",
      name: "签证办理",
      goal: "本周完成材料确认和照片规格核对",
      phase: "等待中",
      status: "waiting",
      progress: 62,
      updatedAt: "5 天前",
      nextAction: "联系中介确认材料清单",
      log: ["今天 · 建议跟进中介清单", "7/10 · 记录照片规格待确认", "7/08 · 护照复印件已准备"],
    },
    {
      id: "learn",
      name: "产品学习",
      goal: "完成课程第 4 章并沉淀笔记",
      phase: "慢推进",
      status: "slow",
      progress: 34,
      updatedAt: "7 天前",
      nextAction: "阅读第 4 章 25 分钟",
      log: ["今天 · 建议生成 25 分钟任务", "7/06 · 完成第 3 章", "7/01 · 新增课程笔记"],
    },
    {
      id: "family",
      name: "家庭事项",
      goal: "处理体检预约和保险资料",
      phase: "正常",
      status: "healthy",
      progress: 48,
      updatedAt: "昨天",
      nextAction: "预约周五体检",
      log: ["昨天 · 整理保险资料", "7/09 · 记录体检可选时间"],
    },
  ],
  tasks: [
    {
      id: "t1",
      title: "客户方案第 3 版",
      projectId: "client",
      due: "今天",
      dueDate: todayLabel,
      status: "doing",
      priority: "high",
      note: "需要先保护深度工作时段",
      createdAt: todayLabel,
    },
    {
      id: "t2",
      title: "联系中介确认材料清单",
      projectId: "visa",
      due: "今天",
      dueDate: todayLabel,
      status: "todo",
      priority: "medium",
      note: "卡住签证办理进度",
      createdAt: todayLabel,
    },
    {
      id: "t3",
      title: "整理照片规格和护照复印件",
      projectId: "visa",
      due: "周三",
      dueDate: "2026-07-15",
      status: "todo",
      priority: "medium",
      note: "可拆成短任务",
      createdAt: todayLabel,
    },
    {
      id: "t4",
      title: "阅读产品课程第 4 章",
      projectId: "learn",
      due: "本周",
      dueDate: "2026-07-17",
      status: "todo",
      priority: "low",
      note: "建议放到晚间低压时段",
      createdAt: todayLabel,
    },
  ],
  events: [
    { id: "e1", title: "客户方案深度工作", projectId: "client", startAt: `${todayLabel}T10:00`, endAt: `${todayLabel}T11:30`, kind: "focus", note: "保护一段不被打断的时间" },
    { id: "e2", title: "项目同步", projectId: "client", startAt: `${todayLabel}T13:00`, endAt: `${todayLabel}T14:00`, kind: "meeting", note: "同步范围和风险" },
    { id: "e3", title: "签证材料处理", projectId: "visa", startAt: "2026-07-15T16:00", endAt: "2026-07-15T16:30", kind: "admin", note: "和本周材料 Todo 放在一起看" },
  ],
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
  const projects = hasInbox ? data.projects : [starterData.projects[0], ...data.projects];
  const projectIds = new Set(projects.map((project) => project.id));
  return {
    projects,
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

function inferDueLabel(text: string) {
  if (text.includes("今天")) return "今天";
  if (text.includes("明天")) return "明天";
  if (text.includes("周三") || text.includes("星期三")) return "周三";
  if (text.includes("周五") || text.includes("星期五")) return "周五";
  if (text.includes("本周")) return "本周";
  return "未定";
}

function inferDueDate(text: string) {
  if (text.includes("今天")) return todayLabel;
  if (text.includes("明天")) return "2026-07-14";
  if (text.includes("周三") || text.includes("星期三")) return "2026-07-15";
  if (text.includes("周五") || text.includes("星期五") || text.includes("本周")) return "2026-07-17";
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

function dateFromInput(dateText: string) {
  return new Date(`${dateText}T00:00:00`);
}

function addDays(dateText: string, days: number) {
  const date = dateFromInput(dateText);
  date.setDate(date.getDate() + days);
  return dateInputFromDate(date);
}

function weekDatesFor(dateText: string) {
  const date = dateFromInput(dateText);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return Array.from({ length: 7 }, (_, index) => addDays(dateInputFromDate(date), mondayOffset + index));
}

function formatWeekDay(dateText: string) {
  const date = dateFromInput(dateText);
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${date.getMonth() + 1}/${date.getDate()} 周${weekdays[date.getDay()]}`;
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

function inferPriority(text: string): Priority {
  if (text.includes("截止") || text.includes("必须") || text.includes("重要") || text.includes("今天")) return "high";
  if (text.includes("本周") || text.includes("周") || text.includes("确认")) return "medium";
  return "low";
}

export default function Home() {
  const [data, setData] = useState<WorkbenchData>(normalizeData(starterData));
  const [dataReady, setDataReady] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [view, setView] = useState<View>("today");
  const [selectedProjectId, setSelectedProjectId] = useState("client");
  const [capture, setCapture] = useState("周三前整理签证材料，今天先问中介清单");
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
  const [meetingProjectId, setMeetingProjectId] = useState("client");
  const [meetingNote, setMeetingNote] = useState("");
  const [planApplied, setPlanApplied] = useState(false);

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

  const projectsById = useMemo(() => {
    return Object.fromEntries(data.projects.map((project) => [project.id, project]));
  }, [data.projects]);

  const selectedProject = projectsById[selectedProjectId] ?? data.projects[0];
  const visibleProjects = data.projects;
  const realProjects = data.projects.filter((project) => project.id !== inboxProjectId);
  const liveTasks = data.tasks.filter((task) => !task.deletedAt);
  const trashedTasks = data.tasks.filter((task) => task.deletedAt);

  const activeTasks = liveTasks.filter((task) => task.status !== "done");
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

  function progressForProject(projectId: string) {
    const tasks = tasksForProject(projectId);
    if (!tasks.length) return 0;
    return Math.round((tasks.filter((task) => task.status === "done").length / tasks.length) * 100);
  }

  function nextTaskForProject(projectId: string) {
    return activeTasksForProject(projectId).sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority])[0];
  }

  const selectedProjectTasks = selectedProject ? tasksForProject(selectedProject.id) : [];
  const selectedActiveTasks = selectedProjectTasks.filter((task) => task.status !== "done");
  const selectedDoneTasks = selectedProjectTasks.filter((task) => task.status === "done");
  const selectedProgress = selectedProject ? progressForProject(selectedProject.id) : 0;
  const selectedNextTask = selectedProject ? nextTaskForProject(selectedProject.id) : undefined;
  const weekDates = useMemo(() => weekDatesFor(todayLabel), []);
  const weekDateSet = useMemo(() => new Set(weekDates), [weekDates]);
  const weekSchedule = weekDates.map((date) => {
    const dayEvents = data.events
      .filter((event) => eventDate(event) === date)
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    const dayTasks = activeTasks
      .filter((task) => task.dueDate === date)
      .sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority]);
    const eventLoad = dayEvents.reduce((total, event) => total + eventMinutes(event), 0);
    const loadRatio = Math.min(100, Math.round((eventLoad / 420) * 100 + dayTasks.length * 10));
    return { date, events: dayEvents, tasks: dayTasks, eventLoad, loadRatio };
  });
  const meetingSchedule = weekDates.map((date) => ({
    date,
    events: data.events
      .filter((event) => event.kind === "meeting" && eventDate(event) === date)
      .sort((a, b) => a.startAt.localeCompare(b.startAt)),
  }));
  const futureMeetings = data.events
    .filter((event) => event.kind === "meeting" && event.endAt >= `${todayLabel}T00:00`)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const weekTaskCount = activeTasks.filter((task) => task.dueDate && weekDateSet.has(task.dueDate)).length;
  const weekMeetingCount = data.events.filter((event) => event.kind === "meeting" && weekDateSet.has(eventDate(event))).length;

  const suggestions = [
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

  function handleCapture(event: FormEvent) {
    event.preventDefault();
    const trimmed = capture.trim();
    if (!trimmed) return;

    const matchedProject =
      data.projects.find((project) => trimmed.includes(project.name.replace("办理", ""))) ??
      data.projects.find((project) => trimmed.includes(project.name.slice(0, 2))) ??
      projectsById[inboxProjectId] ??
      data.projects[0];

    const due = inferDueLabel(trimmed);
    const dueDate = inferDueDate(trimmed);
    const priority = inferPriority(trimmed);
    const pieces = trimmed
      .split(/[，,。；;]/)
      .map((piece) => piece.trim())
      .filter(Boolean);

    const newTasks = pieces.slice(0, 3).map((piece) => ({
      id: makeId("task"),
      title: piece.replace(/^今天先/, "").replace(/^先/, ""),
      projectId: matchedProject.id,
      due,
      dueDate,
      status: "todo" as TaskStatus,
      priority,
      note: "由快速记录整理",
      createdAt: todayLabel,
    }));

    setData((current) => ({
      ...current,
      tasks: [...newTasks, ...current.tasks],
      projects: current.projects.map((project) =>
        project.id === matchedProject.id
          ? {
              ...project,
              updatedAt: "刚刚",
              nextAction: newTasks[0]?.title ?? project.nextAction,
              log: [`刚刚 · 从快速记录新增 ${newTasks.length} 个动作`, ...project.log].slice(0, 5),
            }
          : project,
      ),
    }));
    setSelectedProjectId(matchedProject.id);
    setPlanApplied(false);
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
      progress: 8,
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

  function updateProject(projectId: string, patch: Partial<Project>) {
    setData((current) => ({
      ...current,
      projects: current.projects.map((project) => (project.id === projectId ? { ...project, ...patch } : project)),
    }));
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

  function applyPlan() {
    const firstHigh = highPriorityTasks[0];
    if (!firstHigh) return;
    setData((current) => ({
      ...current,
      events: [
        {
          id: makeId("event"),
          title: firstHigh.title,
          projectId: firstHigh.projectId,
          startAt: `${todayLabel}T15:00`,
          endAt: `${todayLabel}T16:00`,
          kind: "focus",
          note: "由 AI 今日建议加入",
        },
        ...current.events,
      ],
    }));
    setPlanApplied(true);
  }

  function resetDemo() {
    setData(normalizeData(starterData));
    setSelectedProjectId("client");
    setPlanApplied(false);
  }

  const isTrashView = view === "trash";

  return (
    <main className="workbench">
      <aside className="sidebar" aria-label="工作台导航">
        <div className="brand">
          <span className="brand-mark">A</span>
          <div>
            <strong>AI 工作台</strong>
            <small>个人状态图谱</small>
          </div>
        </div>
        <nav className="nav">
          {[
            ["today", "今日"],
            ["meetings", `会议 ${weekMeetingCount ? `(${weekMeetingCount})` : ""}`],
            ["projects", "项目"],
            ["trash", `回收站 ${trashedTasks.length ? `(${trashedTasks.length})` : ""}`],
          ].map(([key, label]) => (
            <button key={key} className={view === key ? "active" : ""} type="button" onClick={() => setView(key as View)}>
              {label}
            </button>
          ))}
        </nav>
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
                <p>2026-07-13 周一</p>
                <h1>今天把哪些事推进一点点？</h1>
                <span className={`save-state ${saveState}`}>{dataReady ? saveStateLabels[saveState] : "正在读取挂载数据文件"}</span>
              </div>
            <button className="secondary" type="button" onClick={resetDemo}>
              重置演示数据
            </button>
            </header>

            <form className="capture" onSubmit={handleCapture}>
              <label>
                快速记录
                <input value={capture} onChange={(event) => setCapture(event.target.value)} placeholder="随手写一句，AI 帮你拆成任务" />
              </label>
              <button type="submit">AI 整理</button>
            </form>

            <section className="stats" aria-label="今日概览">
              <Metric label="今日待办" value={activeTasks.length.toString()} hint={`${highPriorityTasks.length} 个高优先级`} />
              <Metric label="项目" value={realProjects.length.toString()} hint={`${waitingProjects.length} 个需要关注`} />
              <Metric label="Inbox" value={inboxTasks.length.toString()} hint="未归类任务" />
              <Metric label="已完成" value={doneTasks.length.toString()} hint="今日沉淀进展" />
            </section>
          </>
        ) : null}

        {view === "today" && (
          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-head">
                <h2>AI 今日建议</h2>
                <button className="secondary" type="button" onClick={applyPlan}>
                  采纳计划
                </button>
              </div>
              {planApplied && <p className="notice">已把最高优先级任务放入 15:00 后的时间轴。</p>}
              <ol className="suggestions">
                {suggestions.map((suggestion) => (
                  <li key={suggestion}>{suggestion}</li>
                ))}
              </ol>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>任务队列</h2>
                <span>{activeTasks.length} 个未完成</span>
              </div>
              <div className="task-list">
                {liveTasks.map((task) => (
                  <TodayTaskRow
                    key={task.id}
                    task={task}
                    projectsById={projectsById}
                    onStatusChange={(status) => updateTask(task.id, { status })}
                  />
                ))}
              </div>
            </section>

            <section className="panel wide">
              <div className="panel-head">
                <h2>本周时间轴</h2>
                <span>{weekTaskCount} 个 Todo · {weekMeetingCount} 个会议</span>
              </div>
              <div className="week-timeline">
                {weekSchedule.map((day) => (
                  <article className={`week-day ${day.date === todayLabel ? "today" : ""}`} key={day.date}>
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
                        <button className={`week-item ${event.kind}`} key={event.id} type="button" onClick={() => setSelectedProjectId(event.projectId)}>
                          <strong>{event.title}</strong>
                          <span><em className="time-chip">{eventTimeRange(event)}</em> {projectsById[event.projectId]?.name ?? "Inbox / 未归类"}</span>
                          {event.note && <small>{event.note}</small>}
                        </button>
                      ))}
                      {day.tasks.map((task) => (
                        <button className={`week-item todo ${task.priority}`} key={task.id} type="button" onClick={() => setSelectedProjectId(task.projectId)}>
                          <strong>{task.title}</strong>
                          <span>Todo · {projectsById[task.projectId]?.name ?? "Inbox / 未归类"}</span>
                          {task.note && <small>{task.note}</small>}
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
          <div className="dashboard-grid">
            <section className="panel wide">
              <div className="panel-head">
                <h2>创建会议</h2>
                <span>{weekMeetingCount} 个本周会议</span>
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

            <section className="panel wide">
              <div className="panel-head">
                <h2>本周会议时间轴</h2>
                <span>{weekMeetingCount} 个会议</span>
              </div>
              <div className="week-timeline">
                {meetingSchedule.map((day) => (
                  <article className={`week-day ${day.date === todayLabel ? "today" : ""}`} key={day.date}>
                    <header>
                      <div>
                        <strong>{formatWeekDay(day.date)}</strong>
                        <small>{day.events.reduce((total, event) => total + eventMinutes(event), 0)} 分钟会议</small>
                      </div>
                      <span>{day.events.length}</span>
                    </header>
                    <div className="week-items">
                      {day.events.map((event) => (
                        <button className="week-item meeting" key={event.id} type="button" onClick={() => setSelectedProjectId(event.projectId)}>
                          <strong>{event.title}</strong>
                          <span><em className="time-chip">{eventTimeRange(event)}</em> {projectsById[event.projectId]?.name ?? "Inbox / 未归类"}</span>
                          {event.note && <small>{event.note}</small>}
                        </button>
                      ))}
                      {!day.events.length && <p className="empty-state">暂无会议</p>}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel wide">
              <div className="panel-head">
                <h2>未来会议总表</h2>
                <span>{futureMeetings.length} 个未结束会议</span>
              </div>
              <div className="meeting-table">
                {futureMeetings.map((event) => (
                  <article className="meeting-row" key={event.id}>
                    <div>
                      <strong>{event.title}</strong>
                      <p>
                        <em className="time-chip">{eventDate(event)} {eventTimeRange(event)}</em>
                        {projectsById[event.projectId]?.name ?? "Inbox / 未归类"}
                      </p>
                    </div>
                    <label>
                      会议备注
                      <textarea value={event.note} onChange={(inputEvent) => updateEvent(event.id, { note: inputEvent.target.value })} placeholder="会议中随手记录结论、待跟进事项或纪要" />
                    </label>
                  </article>
                ))}
                {!futureMeetings.length && <p className="empty-state">还没有未来会议。</p>}
              </div>
            </section>
          </div>
        )}

        {view === "projects" && selectedProject && (
          <div className="project-page">
            <section className="panel project-create-panel">
              <div className="panel-head">
                <h2>创建项目</h2>
                <span>{realProjects.length} 个项目 · {inboxTasks.length} 个未归类</span>
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
                  const progress = progressForProject(project.id);
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
                      <em>{progress}%</em>
                      <i style={{ width: `${progress}%` }} />
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="panel project-todo-panel">
              <div className="panel-head">
                <h2>项目 Todo</h2>
                <span>{selectedProject.name} · {selectedActiveTasks.length} 个未完成 · {selectedProgress}%</span>
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
                <label>
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
                    />
                  ))}
                  {!selectedDoneTasks.length && <p className="empty-state">还没有完成项。</p>}
                </div>
              </details>
            </section>
            </div>
          </div>
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
}: {
  task: Task;
  projects: Project[];
  projectsById: Record<string, Project>;
  onDelete: (taskId: string) => void;
  onUpdate: (taskId: string, patch: Partial<Task>) => void;
  deleteLabel?: string;
  showProject?: boolean;
}) {
  return (
    <article className={`task ${task.status === "done" ? "done" : ""}`}>
      <div>
        <strong>{task.title}</strong>
        <p>
          {showProject ? `${projectsById[task.projectId]?.name ?? "Inbox / 未归类"} · ` : ""}
          {formatDue(task)}
        </p>
        <label className="task-note">
          备注
          <input value={task.note ?? ""} onChange={(event) => onUpdate(task.id, { note: event.target.value })} placeholder="补充一点上下文" />
        </label>
      </div>
      <div className="task-actions">
        <select value={task.projectId} onChange={(event) => onUpdate(task.id, { projectId: event.target.value })} aria-label="所属项目">
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
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
