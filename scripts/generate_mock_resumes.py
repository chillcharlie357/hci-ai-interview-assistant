from __future__ import annotations

import platform
from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "mock-resumes"

# 跨平台宋体字体路径
_CJK_FONT_CANDIDATES: dict[str, list[str]] = {
    "Windows": ["C:/Windows/Fonts/simsun.ttc"],
    "Darwin": ["/System/Library/Fonts/Supplemental/Songti.ttc", "/Library/Fonts/Songti.ttc"],
    "Linux": ["/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"],
}


def _find_cjk_font() -> str:
    system = platform.system()
    for candidate in _CJK_FONT_CANDIDATES.get(system, []):
        if Path(candidate).exists():
            return candidate
    raise FileNotFoundError(
        f"未找到中文字体。请安装宋体/SimSun/NotoSansCJK 后重试。"
        f"（当前系统: {system}，已搜索: {_CJK_FONT_CANDIDATES.get(system, [])}）"
    )


SONGTI_PATH = _find_cjk_font()
pdfmetrics.registerFont(TTFont("Songti", SONGTI_PATH))

RESUMES = (
    {
        "file_stem": "frontend_senior_li_ming",
        "title": "李明 - 高级前端工程师",
        "paragraphs": (
            "目标岗位：高级前端工程师 / 前端架构方向",
            "工作年限：6 年。常用技术：TypeScript、React、Vite、Node.js、Vitest、Playwright。",
            "最近项目：负责 B2B 数据分析平台前端架构升级，将多页配置台改造为模块化工作台，"
            "沉淀表单 schema、权限菜单、图表组件和前端监控。",
            "核心成果：首屏加载时间从 3.8 秒降至 1.6 秒；将关键页面 E2E 覆盖率从 0 提升到 65%；"
            "推动代码评审规范和组件文档落地。",
            "可追问点：复杂表单状态管理、权限控制、性能优化、跨团队协作、前端测试策略。",
        ),
    },
    {
        "file_stem": "backend_platform_chen_yu",
        "title": "陈宇 - 后端平台工程师",
        "paragraphs": (
            "目标岗位：Python 后端工程师 / 平台工程方向",
            "工作年限：5 年。常用技术：Python、FastAPI、PostgreSQL、Redis、Celery、Docker、Kubernetes。",
            "最近项目：设计并实现企业内部任务编排平台，支持异步任务、重试、审计日志、租户隔离和指标告警。",
            "核心成果：任务失败定位时间从小时级降到分钟级；通过连接池和批处理将高峰期 API P95 从 900ms 降到 240ms。",
            "可追问点：数据库索引设计、异步任务一致性、接口限流、容器部署、故障排查案例。",
        ),
    },
    {
        "file_stem": "ml_engineer_zhao_nan",
        "title": "赵楠 - 机器学习工程师",
        "paragraphs": (
            "目标岗位：机器学习工程师 / 多模态算法方向",
            "工作年限：3 年。常用技术：PyTorch、Transformers、OpenCV、PaddleOCR、向量检索、模型评测。",
            "最近项目：负责面向工业质检的图像异常检测系统，构建数据清洗、训练、离线评测和在线推理服务。",
            "核心成果：缺陷召回率从 82% 提升到 93%；通过蒸馏和 TensorRT 将单图推理耗时从 120ms 降到 38ms。",
            "可追问点：数据不平衡、模型上线监控、误报漏报分析、视觉模型优化、多模态应用边界。",
        ),
    },
    {
        "file_stem": "ai_product_wang_xin",
        "title": "王欣 - AI 产品经理",
        "paragraphs": (
            "目标岗位：AI 产品经理 / 智能应用方向",
            "工作年限：4 年。常用领域：LLM 应用、RAG、标注体系、B 端产品设计、数据分析。",
            "最近项目：从 0 到 1 推动客服知识库助手，负责需求访谈、数据闭环、评测集设计、灰度策略和运营看板。",
            "核心成果：试点团队平均响应时长降低 28%；建立命中率、幻觉率、人工接管率等评估指标。",
            "可追问点：如何定义 AI 产品效果、如何处理模型失败、评测集建设、跨部门推进、隐私与合规边界。",
        ),
    },
)


def write_pdf(file_stem: str, title: str, paragraphs: tuple[str, ...]) -> None:
    path = OUTPUT_DIR / f"{file_stem}.pdf"

    c = canvas.Canvas(str(path))
    c.setTitle(title)

    y = 750
    c.setFont("Songti", 16)
    c.drawString(50, y, title)
    y -= 35

    c.setFont("Songti", 11)
    for para in paragraphs:
        c.drawString(50, y, para)
        y -= 22

    c.save()
    print(f"  PDF: {path.name} ({path.stat().st_size} bytes)")


def write_markdown(file_stem: str, title: str, paragraphs: tuple[str, ...]) -> None:
    path = OUTPUT_DIR / "sources" / f"{file_stem}.md"
    content = "# " + title + "\n\n" + "\n\n".join(paragraphs) + "\n"
    path.write_text(content, encoding="utf-8")
    print(f"  MD:  {path.name}")


def main() -> None:
    (OUTPUT_DIR / "sources").mkdir(parents=True, exist_ok=True)

    for resume in RESUMES:
        print(f"--- {resume['title']} ---")
        write_pdf(resume["file_stem"], resume["title"], resume["paragraphs"])
        write_markdown(resume["file_stem"], resume["title"], resume["paragraphs"])

    print(f"\nDone. Files in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
