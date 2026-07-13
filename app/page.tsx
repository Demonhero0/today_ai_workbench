"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type TaskStatus = "todo" | "doing" | "waiting" | "done";
type Priority = "high" | "medium" | "low";
type View = "today" | "projects" | "review";

type Task = {
  id: string;
  title: string;
  projectId: string;
  due: string;
  status: TaskStatus;
  priority: Priority;
  estimate: number;
  note: string;
  createdAt: string;
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
  blocker: string;
  log: string[];
};

type CalendarEvent = {
  id: string;
  title: string;
  projectId: string;
  start: number;
  end: number;
  kind: "meeting" | "deep" | "admin";
};

type WorkbenchData = {
  tasks: Task[];
  projects: Project[];
  events: CalendarEvent[];
};

const todayLabel = "2026-07-13";

const starterData: WorkbenchData = {
  projects: [
    {
      id: "client",
      name: "客户项目",
      goal: "完成方案评审并收敛交付范围",
      phase: "冲刺中",
      status: "active",
      progress: 78,
      updatedAt: "今天",
      nextAction: "完成方案第 3 版",
      blocker: "等待明天评审反馈",
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
      blocker: "中介清单未回复",
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
      blocker: "没有固定时间块",
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
      blocker: "无",
      log: ["昨天 · 整理保险资料", "7/09 · 记录体检可选时间"],
    },
  ],
  tasks: [
    {
      id: "t1",
      title: "客户方案第 3 版",
      projectId: "client",
      due: "今天 12:00",
      status: "doing",
      priority: "high",
      estimate: 90,
      note: "需要先保护深度工作时段",
      createdAt: todayLabel,
    },
    {
      id: "t2",
      title: "联系中介确认材料清单",
      projectId: "visa",
      due: "今天",
      status: "todo",
      priority: "medium",
      estimate: 20,
      note: "卡住签证办理进度",
      createdAt: todayLabel,
    },
    {
      id: "t3",
      title: "整理照片规格和护照复印件",
      projectId: "visa",
      due: "周三",
      status: "todo",
      priority: "medium",
      estimate: 35,
      note: "可拆成短任务",
      createdAt: todayLabel,
    },
    {
      id: "t4",
      title: "阅读产品课程第 4 章",
      projectId: "learn",
      due: "本周",
      status: "todo",
      priority: "low",
      estimate: 25,
      note: "建议放到晚间低压时段",
      createdAt: todayLabel,
    },
  ],
  events: [
    { id: "e1", title: "客户方案深度工作", projectId: "client", start: 10, end: 11.5, kind: "deep" },
    { id: "e2", title: "项目同步", projectId: "client", start: 13, end: 14, kind: "meeting" },
    { id: "e3", title: "签证材料处理", projectId: "visa", start: 16, end: 16.5, kind: "admin" },
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

const saveStateLabels = {
  idle: "等待保存到挂载数据文件",
  saving: "正在保存到挂载数据文件",
  saved: "已保存到挂载数据文件",
  error: "数据文件暂时不可用",
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function inferDue(text: string) {
  if (text.includes("今天")) return "今天";
  if (text.includes("明天")) return "明天";
  if (text.includes("周三") || text.includes("星期三")) return "周三";
  if (text.includes("周五") || text.includes("星期五")) return "周五";
  if (text.includes("本周")) return "本周";
  return "未定";
}

function inferPriority(text: string): Priority {
  if (text.includes("截止") || text.includes("必须") || text.includes("重要") || text.includes("今天")) return "high";
  if (text.includes("本周") || text.includes("周") || text.includes("确认")) return "medium";
  return "low";
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, value));
}

export default function Home() {
  const [data, setData] = useState<WorkbenchData>(starterData);
  const [dataReady, setDataReady] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [view, setView] = useState<View>("today");
  const [selectedProjectId, setSelectedProjectId] = useState("visa");
  const [capture, setCapture] = useState("周三前整理签证材料，今天先问中介清单");
  const [projectName, setProjectName] = useState("");
  const [projectGoal, setProjectGoal] = useState("");
  const [planApplied, setPlanApplied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMountedData() {
      try {
        const response = await fetch("/api/workbench", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load data");
        const payload = (await response.json()) as { data?: WorkbenchData | null };
        if (!cancelled && payload.data) {
          setData(payload.data);
          setSelectedProjectId(payload.data.projects[0]?.id ?? "visa");
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

  const activeTasks = data.tasks.filter((task) => task.status !== "done");
  const highPriorityTasks = activeTasks.filter((task) => task.priority === "high");
  const waitingProjects = data.projects.filter((project) => project.status === "waiting" || project.status === "slow");
  const doneTasks = data.tasks.filter((task) => task.status === "done");

  const suggestions = [
    highPriorityTasks.length
      ? `优先处理 ${highPriorityTasks[0].title}，它是当前最高风险动作。`
      : "今天没有高优先级任务，可以安排一段维护性整理。",
    waitingProjects.length
      ? `${waitingProjects[0].name} 处于${waitingProjects[0].phase}，建议推进下一步：${waitingProjects[0].nextAction}。`
      : "所有项目都有近期进展，适合做一次轻量复盘。",
    "15:00-16:30 是今天最长空档，适合放 60 分钟以上的深度任务。",
  ];

  function updateTask(taskId: string, patch: Partial<Task>) {
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
    }));
  }

  function deleteTask(taskId: string) {
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
      data.projects[0];

    const due = inferDue(trimmed);
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
      status: "todo" as TaskStatus,
      priority,
      estimate: piece.length > 14 ? 35 : 20,
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
      blocker: "无",
      log: ["刚刚 · 新建项目"],
    };
    setData((current) => ({ ...current, projects: [project, ...current.projects] }));
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
          start: 15,
          end: Math.min(18, 15 + firstHigh.estimate / 60),
          kind: "deep",
        },
        ...current.events,
      ],
    }));
    setPlanApplied(true);
  }

  function resetDemo() {
    setData(starterData);
    setSelectedProjectId("visa");
    setPlanApplied(false);
  }

  const heatRows = data.projects.slice(0, 4).map((project, index) => {
    const projectTasks = data.tasks.filter((task) => task.projectId === project.id && task.status !== "done");
    return {
      name: project.name.slice(0, 4),
      values: Array.from({ length: 7 }, (_, day) => {
        const base = Math.min(3, projectTasks.length);
        const pressure = project.status === "waiting" ? 1 : project.status === "slow" ? 0 : 2;
        return Math.max(0, Math.min(3, Math.round((base + pressure + ((day + index) % 3)) / 2)));
      }),
    };
  });

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
            ["projects", "项目"],
            ["review", "复盘"],
          ].map(([key, label]) => (
            <button key={key} className={view === key ? "active" : ""} type="button" onClick={() => setView(key as View)}>
              {label}
            </button>
          ))}
        </nav>
        <form className="new-project" onSubmit={addProject}>
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
      </aside>

      <section className="content">
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
          <Metric label="并行事项" value={data.projects.length.toString()} hint={`${waitingProjects.length} 个需要关注`} />
          <Metric label="最长空档" value="90m" hint="15:00-16:30" />
          <Metric label="已完成" value={doneTasks.length.toString()} hint="今日沉淀进展" />
        </section>

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
                {data.tasks.map((task) => (
                  <article className={`task ${task.status === "done" ? "done" : ""}`} key={task.id}>
                    <div>
                      <strong>{task.title}</strong>
                      <p>
                        {projectsById[task.projectId]?.name ?? "未归类"} · {task.due} · {task.estimate} 分钟
                      </p>
                    </div>
                    <div className="task-actions">
                      <select value={task.status} onChange={(event) => updateTask(task.id, { status: event.target.value as TaskStatus })} aria-label="任务状态">
                        {Object.entries(statusLabels).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <span className={`pill ${task.priority}`}>{priorityLabels[task.priority]}</span>
                      <button className="icon-button" type="button" onClick={() => deleteTask(task.id)} aria-label={`删除 ${task.title}`}>
                        ×
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel wide">
              <div className="panel-head">
                <h2>今日时间轴</h2>
                <span>09:00-18:00</span>
              </div>
              <div className="timeline">
                {Array.from({ length: 10 }, (_, index) => (
                  <span className="hour" key={index}>
                    {String(index + 9).padStart(2, "0")}:00
                  </span>
                ))}
                <div className="lane">
                  {data.events.map((event) => {
                    const top = ((event.start - 9) / 9) * 100;
                    const height = ((event.end - event.start) / 9) * 100;
                    return (
                      <button
                        className={`event ${event.kind}`}
                        key={event.id}
                        style={{ top: `${top}%`, height: `${Math.max(height, 8)}%` }}
                        type="button"
                        onClick={() => setSelectedProjectId(event.projectId)}
                      >
                        <strong>{event.title}</strong>
                        <span>
                          {event.start}:00-{event.end % 1 ? `${Math.floor(event.end)}:30` : `${event.end}:00`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="panel wide">
              <div className="panel-head">
                <h2>未来负载</h2>
                <span>未来 7 天</span>
              </div>
              <div className="heatmap">
                <span />
                {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
                  <b key={day}>{day}</b>
                ))}
                {heatRows.map((row) => (
                  <FragmentRow key={row.name} name={row.name} values={row.values} />
                ))}
              </div>
            </section>
          </div>
        )}

        {view === "projects" && selectedProject && (
          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-head">
                <h2>项目看板</h2>
                <span>{data.projects.length} 个事项</span>
              </div>
              <div className="project-list">
                {data.projects.map((project) => (
                  <button
                    className={`project-card ${selectedProject.id === project.id ? "selected" : ""}`}
                    key={project.id}
                    type="button"
                    onClick={() => setSelectedProjectId(project.id)}
                  >
                    <span>
                      <strong>{project.name}</strong>
                      <small>{project.phase} · {project.updatedAt}</small>
                    </span>
                    <em>{project.progress}%</em>
                    <i style={{ width: `${project.progress}%` }} />
                  </button>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>{selectedProject.name}</h2>
                <span>{selectedProject.phase}</span>
              </div>
              <label>
                目标
                <input value={selectedProject.goal} onChange={(event) => updateProject(selectedProject.id, { goal: event.target.value, updatedAt: "刚刚" })} />
              </label>
              <label>
                下一步动作
                <input value={selectedProject.nextAction} onChange={(event) => updateProject(selectedProject.id, { nextAction: event.target.value, updatedAt: "刚刚" })} />
              </label>
              <label>
                阻塞点
                <input value={selectedProject.blocker} onChange={(event) => updateProject(selectedProject.id, { blocker: event.target.value, updatedAt: "刚刚" })} />
              </label>
              <label>
                进度 {selectedProject.progress}%
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={selectedProject.progress}
                  onChange={(event) => updateProject(selectedProject.id, { progress: clampProgress(Number(event.target.value)), updatedAt: "刚刚" })}
                />
              </label>
            </section>

            <section className="panel wide">
              <div className="panel-head">
                <h2>项目时间线</h2>
                <span>自动沉淀变化</span>
              </div>
              <ul className="log-list">
                {selectedProject.log.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {view === "review" && (
          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-head">
                <h2>周复盘摘要</h2>
                <span>自动生成草稿</span>
              </div>
              <ol className="suggestions">
                <li>客户项目推进最快，已完成 {data.tasks.filter((task) => task.projectId === "client" && task.status === "done").length} 个关键动作。</li>
                <li>签证办理的主要风险是等待外部回复，建议把可做事项和等待事项拆开。</li>
                <li>学习项目适合改成每天 25 分钟，不要继续用大块目标压自己。</li>
              </ol>
            </section>
            <section className="panel chart-panel">
              <div className="panel-head">
                <h2>事项走势</h2>
                <span>完成 / 等待 / 停滞</span>
              </div>
              <div className="trend" aria-label="事项走势示意图">
                <svg viewBox="0 0 520 220" role="img">
                  <path d="M52 24V184H492" />
                  <path d="M52 144H492M52 104H492M52 64H492" className="gridline" />
                  <path d="M52 160L125 148L198 132L271 112L344 96L417 78L492 62" className="line complete" />
                  <path d="M52 86L125 92L198 88L271 96L344 94L417 90L492 86" className="line wait" />
                  <path d="M52 72L125 78L198 96L271 118L344 128L417 142L492 156" className="line stuck" />
                  <text x="390" y="58">完成增加</text>
                  <text x="390" y="86">等待持平</text>
                  <text x="390" y="156">停滞下降</text>
                </svg>
              </div>
            </section>
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

function FragmentRow({ name, values }: { name: string; values: number[] }) {
  return (
    <>
      <span className="heat-label">{name}</span>
      {values.map((value, index) => (
        <span className="heat-cell" data-load={value} key={`${name}-${index}`}>
          {value > 0 ? value : ""}
        </span>
      ))}
    </>
  );
}
