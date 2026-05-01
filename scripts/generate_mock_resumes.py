from __future__ import annotations

from dataclasses import dataclass
from html import escape
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "mock-resumes"


@dataclass(frozen=True)
class MockResume:
    file_name: str
    title: str
    paragraphs: tuple[str, ...]


RESUMES = (
    MockResume(
        file_name="frontend_senior_li_ming.docx",
        title="李明 - 高级前端工程师",
        paragraphs=(
            "目标岗位：高级前端工程师 / 前端架构方向",
            "工作年限：6 年。常用技术：TypeScript、React、Vite、Node.js、Vitest、Playwright。",
            "最近项目：负责 B2B 数据分析平台前端架构升级，将多页配置台改造为模块化工作台，沉淀表单 schema、权限菜单、图表组件和前端监控。",
            "核心成果：首屏加载时间从 3.8 秒降至 1.6 秒；将关键页面 E2E 覆盖率从 0 提升到 65%；推动代码评审规范和组件文档落地。",
            "可追问点：复杂表单状态管理、权限控制、性能优化、跨团队协作、前端测试策略。",
        ),
    ),
    MockResume(
        file_name="backend_platform_chen_yu.docx",
        title="陈宇 - 后端平台工程师",
        paragraphs=(
            "目标岗位：Python 后端工程师 / 平台工程方向",
            "工作年限：5 年。常用技术：Python、FastAPI、PostgreSQL、Redis、Celery、Docker、Kubernetes。",
            "最近项目：设计并实现企业内部任务编排平台，支持异步任务、重试、审计日志、租户隔离和指标告警。",
            "核心成果：任务失败定位时间从小时级降到分钟级；通过连接池和批处理将高峰期 API P95 从 900ms 降到 240ms。",
            "可追问点：数据库索引设计、异步任务一致性、接口限流、容器部署、故障排查案例。",
        ),
    ),
    MockResume(
        file_name="ai_product_wang_xin.docx",
        title="王欣 - AI 产品经理",
        paragraphs=(
            "目标岗位：AI 产品经理 / 智能应用方向",
            "工作年限：4 年。常用领域：LLM 应用、RAG、标注体系、B 端产品设计、数据分析。",
            "最近项目：从 0 到 1 推动客服知识库助手，负责需求访谈、数据闭环、评测集设计、灰度策略和运营看板。",
            "核心成果：试点团队平均响应时长降低 28%；建立命中率、幻觉率、人工接管率等评估指标。",
            "可追问点：如何定义 AI 产品效果、如何处理模型失败、评测集建设、跨部门推进、隐私与合规边界。",
        ),
    ),
    MockResume(
        file_name="ml_engineer_zhao_nan.docx",
        title="赵楠 - 机器学习工程师",
        paragraphs=(
            "目标岗位：机器学习工程师 / 多模态算法方向",
            "工作年限：3 年。常用技术：PyTorch、Transformers、OpenCV、PaddleOCR、向量检索、模型评测。",
            "最近项目：负责面向工业质检的图像异常检测系统，构建数据清洗、训练、离线评测和在线推理服务。",
            "核心成果：缺陷召回率从 82% 提升到 93%；通过蒸馏和 TensorRT 将单图推理耗时从 120ms 降到 38ms。",
            "可追问点：数据不平衡、模型上线监控、误报漏报分析、视觉模型优化、多模态应用边界。",
        ),
    ),
)


CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
"""

ROOT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
"""

APP_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>hci-ai-interview-assistant</Application>
</Properties>
"""


def paragraph_xml(text: str, *, heading: bool = False) -> str:
    size = "32" if heading else "22"
    bold = "<w:b/>" if heading else ""
    return (
        "<w:p><w:r><w:rPr>"
        f"{bold}<w:sz w:val=\"{size}\"/><w:szCs w:val=\"{size}\"/>"
        "</w:rPr>"
        f"<w:t>{escape(text)}</w:t>"
        "</w:r></w:p>"
    )


def document_xml(resume: MockResume) -> str:
    body = [paragraph_xml(resume.title, heading=True)]
    body.extend(paragraph_xml(paragraph) for paragraph in resume.paragraphs)
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body>"
        + "".join(body)
        + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>'
        "</w:body></w:document>"
    )


def core_xml(resume: MockResume) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/">'
        f"<dc:title>{escape(resume.title)}</dc:title>"
        "<dc:creator>hci-ai-interview-assistant</dc:creator>"
        "</cp:coreProperties>"
    )


def write_docx(resume: MockResume) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / resume.file_name
    with ZipFile(output_path, "w", ZIP_DEFLATED) as docx:
        docx.writestr("[Content_Types].xml", CONTENT_TYPES)
        docx.writestr("_rels/.rels", ROOT_RELS)
        docx.writestr("word/document.xml", document_xml(resume))
        docx.writestr("docProps/core.xml", core_xml(resume))
        docx.writestr("docProps/app.xml", APP_XML)


def write_markdown_source(resume: MockResume) -> None:
    source_dir = OUTPUT_DIR / "sources"
    source_dir.mkdir(parents=True, exist_ok=True)
    output_path = source_dir / resume.file_name.replace(".docx", ".md")
    content = "# " + resume.title + "\n\n" + "\n\n".join(resume.paragraphs) + "\n"
    output_path.write_text(content, encoding="utf-8")


def main() -> None:
    for resume in RESUMES:
        write_docx(resume)
        write_markdown_source(resume)
    print(f"Generated {len(RESUMES)} mock resumes in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
