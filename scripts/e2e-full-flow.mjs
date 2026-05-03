import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const API = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8000";
const APP = process.env.E2E_FRONTEND_BASE_URL || "http://localhost:5173";
const DOWNLOAD_DIR = process.env.E2E_DOWNLOAD_DIR || "/private/tmp/hci-mocked-device-downloads";
const SCREENSHOT_DIR = process.env.E2E_SCREENSHOT_DIR || "/private/tmp/hci-mocked-device-screens";
const RESUME = process.env.E2E_RESUME_PATH || path.join(ROOT, "mock-resumes", "frontend_senior_li_ming.docx");
const ANSWERS = [
  "我负责 AI 辅助面试系统的招聘端和候选人端体验，把简历解析、题目生成、数字人提问和报告证据链串成完整流程。",
  "前端用 TypeScript 和 React 管理状态，后端用 Python API 保存 session、answers 和 report visibility，关键接口保持可测试。",
  "遇到网络抖动时，我会把题目进度、草稿字幕和已提交回答拆开存储，避免重复提交或丢失回答。",
  "性能优化上，我会减少无意义重渲染，把报告下载和题目预览抽成纯函数，并用测试覆盖文件名和权限边界。",
  "如果候选人回答很短，我会标记待人工确认，并让数字人基于当前问题追问具体项目、指标和个人贡献。",
  "这个系统的价值是让面试复盘有证据链，但边界是不能替代招聘决策，也不能输出自动化录用结论。"
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const candidates = [
      process.env.PLAYWRIGHT_MODULE_PATH,
      path.join(ROOT, "node_modules", "playwright", "index.mjs"),
      path.join(ROOT, "frontend", "node_modules", "playwright", "index.mjs"),
      "/opt/homebrew/lib/node_modules/playwright/index.mjs",
      "/usr/local/lib/node_modules/playwright/index.mjs"
    ].filter(Boolean);
    for (const candidate of candidates) {
      try {
        return await import(pathToFileURL(candidate).href);
      } catch {
        // Try the next known location.
      }
    }
  }
  throw new Error("Playwright module not found. Install Playwright globally or set PLAYWRIGHT_MODULE_PATH.");
}

async function installDeviceAndSpeechMocks(page) {
  await page.addInitScript((answers) => {
    window.__mockedDeviceRequests = 0;
    window.__spokenPrompts = [];
    window.__sttAnswers = [...answers];

    class MockUtterance {
      constructor(text) {
        this.text = text;
        this.lang = "";
        this.rate = 1;
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
      }
    }

    class MockSpeechRecognition {
      constructor() {
        this.continuous = false;
        this.interimResults = false;
        this.lang = "zh-CN";
        this.onresult = null;
        this.onerror = null;
      }

      start() {
        const transcript = window.__sttAnswers.shift() || "这是 mock 语音回答。";
        setTimeout(() => {
          this.onresult?.({
            results: [
              {
                0: { transcript }
              }
            ]
          });
        }, 20);
      }

      stop() {
        return undefined;
      }
    }

    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: MockUtterance
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel: () => undefined,
        speak: (utterance) => {
          window.__spokenPrompts.push(utterance.text);
          utterance.onstart?.();
          setTimeout(() => utterance.onend?.(), 20);
        }
      }
    });
    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      value: MockSpeechRecognition
    });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: MockSpeechRecognition
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          window.__mockedDeviceRequests += 1;
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 480;
          const context = canvas.getContext("2d");
          let frame = 0;
          setInterval(() => {
            frame += 1;
            context.fillStyle = "#f5f7fb";
            context.fillRect(0, 0, 640, 480);
            context.fillStyle = "#0f766e";
            context.beginPath();
            context.arc(320 + Math.sin(frame / 6) * 16, 210, 70, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = "#172033";
            context.font = "28px sans-serif";
            context.fillText("Mock Camera", 230, 380);
          }, 80);
          const videoStream = canvas.captureStream(15);
          const audioContext = new AudioContext();
          const oscillator = audioContext.createOscillator();
          const destination = audioContext.createMediaStreamDestination();
          oscillator.frequency.value = 220;
          oscillator.connect(destination);
          oscillator.start();
          return new MediaStream([...videoStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
        }
      }
    });
  }, ANSWERS);
}

async function assertMockDevices(page) {
  const trackCounts = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const result = {
      audio: stream.getAudioTracks().length,
      video: stream.getVideoTracks().length,
      requests: window.__mockedDeviceRequests
    };
    stream.getTracks().forEach((track) => track.stop());
    return result;
  });
  assert(trackCounts.audio === 1, `expected one mock audio track, got ${trackCounts.audio}`);
  assert(trackCounts.video === 1, `expected one mock video track, got ${trackCounts.video}`);
  assert(trackCounts.requests >= 1, "expected mock getUserMedia to be called");
  return trackCounts;
}

async function main() {
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  await fs.access(RESUME);
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1100 }
  });

  const recruiter = await context.newPage();
  await recruiter.goto(`${APP}/recruiter`, { waitUntil: "networkidle" });
  await recruiter.getByLabel("候选人", { exact: true }).fill("完整测试候选人");
  await recruiter.locator('input[type="file"]').setInputFiles(RESUME);
  await recruiter.getByRole("button", { name: "上传并解析" }).click();
  await recruiter.getByText("李明 - 高级前端工程师").waitFor({ state: "visible" });
  await recruiter.getByLabel("招聘方回答").fill(
    "职位是 AI 产品工程师，需要 Python、TypeScript、LLM 应用、会议体验和工程落地能力。重点考察项目深度、系统设计和表达能力。"
  );
  await recruiter.getByRole("button", { name: "提交职位信息" }).click();
  await recruiter.getByText("AI 产品工程师").waitFor({ state: "visible" });
  await recruiter.getByLabel("报告可见性").selectOption("shared_with_candidate");
  await recruiter.getByRole("button", { name: "生成问题和面试链接" }).click();
  await recruiter.getByText("生成测试题目").waitFor({ state: "visible" });
  await recruiter.locator("dt", { hasText: "追问建议" }).first().waitFor({ state: "visible" });
  await recruiter.locator("dt", { hasText: "观察点" }).first().waitFor({ state: "visible" });
  const interviewUrl = await recruiter.locator("input[readonly]").inputValue();
  assert(interviewUrl.includes("/interview/"), `missing interview url: ${interviewUrl}`);
  const sessionId = interviewUrl.split("/interview/")[1];
  const questionCount = await recruiter.locator(".question-list li").count();
  assert(questionCount >= 6, `expected at least 6 questions, got ${questionCount}`);

  const recruiterDownloadPromise = recruiter.waitForEvent("download", { timeout: 90000 });
  await recruiter.getByRole("button", { name: "下载面试结果" }).click();
  const recruiterDownload = await recruiterDownloadPromise;
  const recruiterReportPath = path.join(DOWNLOAD_DIR, recruiterDownload.suggestedFilename());
  await recruiterDownload.saveAs(recruiterReportPath);
  assert(recruiterDownload.suggestedFilename().endsWith(".md"), "recruiter report should download as markdown");
  assert((await fs.readFile(recruiterReportPath, "utf8")).includes("# 智能面试纪要"), "recruiter report should contain markdown title");
  await recruiter.screenshot({ path: path.join(SCREENSHOT_DIR, "recruiter-questions.png"), fullPage: true });

  const candidate = await context.newPage();
  await installDeviceAndSpeechMocks(candidate);
  await candidate.goto(interviewUrl, { waitUntil: "networkidle" });
  const trackCounts = await assertMockDevices(candidate);
  await candidate.getByText("实时字幕").waitFor({ state: "visible" });
  assert(await candidate.getByRole("button", { name: "重播问题" }).count() === 0, "candidate should not see replay button");
  assert(await candidate.getByRole("button", { name: "提交回答" }).count() === 0, "candidate should not see submit answer button");

  for (let index = 0; index < questionCount; index += 1) {
    await candidate.getByRole("button", { name: "结束回答" }).waitFor({ state: "visible", timeout: 60000 });
    await candidate.waitForFunction(() => {
      const input = document.querySelector(".caption-input textarea");
      return Boolean(input?.value?.trim());
    }, undefined, { timeout: 60000 });
    await candidate.getByRole("button", { name: "结束回答" }).click();
    if (index < questionCount - 1) {
      await candidate.waitForFunction(
        (expected) => document.querySelector(".subtitle-panel h2")?.textContent?.startsWith(`${expected}/`),
        index + 2,
        { timeout: 60000 }
      );
    } else {
      await candidate.getByText("已结束").waitFor({ state: "visible", timeout: 60000 });
    }
  }

  const spokenPromptCount = await candidate.evaluate(() => window.__spokenPrompts.length);
  assert(spokenPromptCount >= questionCount, `expected at least ${questionCount} spoken prompts, got ${spokenPromptCount}`);
  await candidate.getByRole("button", { name: "下载面试结果" }).waitFor({ state: "visible" });
  const candidateDownloadPromise = candidate.waitForEvent("download", { timeout: 90000 });
  await candidate.getByRole("button", { name: "下载面试结果" }).click();
  const candidateDownload = await candidateDownloadPromise;
  const candidateReportPath = path.join(DOWNLOAD_DIR, candidateDownload.suggestedFilename());
  await candidateDownload.saveAs(candidateReportPath);
  const candidateReport = await fs.readFile(candidateReportPath, "utf8");
  assert(candidateReport.includes(`已回答：${questionCount}`), "candidate report should include all answers");
  for (const forbidden of ["建议录用", "不建议录用", "hire", "no-hire", "no hire", "自动评分结论"]) {
    assert(!candidateReport.toLowerCase().includes(forbidden.toLowerCase()), `report contains forbidden decision phrase: ${forbidden}`);
  }
  await candidate.screenshot({ path: path.join(SCREENSHOT_DIR, "candidate-complete.png"), fullPage: true });

  const apiSession = await (await fetch(`${API}/api/sessions/${sessionId}`)).json();
  assert(apiSession.answers.length === questionCount, `API expected ${questionCount} answers, got ${apiSession.answers.length}`);
  const recruiterReportResponse = await fetch(`${API}/api/sessions/${sessionId}/report?viewer=recruiter`);
  assert(recruiterReportResponse.status === 200, `recruiter report expected 200, got ${recruiterReportResponse.status}`);
  const candidateReportResponse = await fetch(`${API}/api/sessions/${sessionId}/report?viewer=candidate`);
  assert(candidateReportResponse.status === 200, `shared candidate report expected 200, got ${candidateReportResponse.status}`);

  const hiddenSessionResponse = await fetch(`${API}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      candidate_name: "权限测试候选人",
      resume: "候选人做过 AI 面试平台。",
      job_description: "职位是 AI 产品工程师。",
      interview_goal: "评估项目经验。"
    })
  });
  assert(hiddenSessionResponse.ok, "hidden session create failed");
  const hiddenSession = await hiddenSessionResponse.json();
  const hiddenCandidate = await context.newPage();
  await installDeviceAndSpeechMocks(hiddenCandidate);
  await hiddenCandidate.goto(`${APP}/interview/${hiddenSession.id}`, { waitUntil: "networkidle" });
  await hiddenCandidate.getByText("报告默认仅招聘端可见。").waitFor({ state: "visible" });
  assert(await hiddenCandidate.getByRole("button", { name: "下载面试结果" }).count() === 0, "recruiter_only candidate should not see download");
  const hiddenReportResponse = await fetch(`${API}/api/sessions/${hiddenSession.id}/report?viewer=candidate`);
  assert(hiddenReportResponse.status === 403, `recruiter_only candidate report expected 403, got ${hiddenReportResponse.status}`);

  await browser.close();
  console.log(
    JSON.stringify(
      {
        ok: true,
        sessionId,
        questionCount,
        answers: apiSession.answers.length,
        spokenPromptCount,
        mockDeviceTracks: trackCounts,
        recruiterReportPath,
        candidateReportPath,
        screenshots: SCREENSHOT_DIR
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
