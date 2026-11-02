const loading = document.getElementById('doc-loading');
const errorBox = document.getElementById('doc-error');
const content = document.getElementById('doc-content');
const fileLabel = document.getElementById('doc-file');
const backLink = document.getElementById('back-cabinet');
const rawLink = document.getElementById('raw-link');
const downloadLink = document.getElementById('download-link');

function showError(message, detail = '') {
  loading.hidden = true;
  content.hidden = true;
  errorBox.hidden = false;
  errorBox.innerHTML = '';

  const title = document.createElement('h2');
  title.textContent = message;
  errorBox.append(title);

  if (detail) {
    const text = document.createElement('p');
    text.textContent = detail;
    errorBox.append(text);
  }

  if (rawLink.href && rawLink.href !== '#') {
    const fallback = document.createElement('p');
    const link = document.createElement('a');
    link.href = rawLink.href;
    link.textContent = '打开原始 Markdown 文件';
    link.target = '_blank';
    link.rel = 'noopener';
    fallback.append(link);
    errorBox.append(fallback);
  }
}

function getFileParam() {
  const params = new URLSearchParams(window.location.search);
  return (params.get('file') || '').trim();
}

function resolveMarkdownUrl(file) {
  if (!file) throw new Error('缺少 file 参数。');
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(file)) {
    throw new Error('不允许加载外部地址。');
  }

  const url = new URL(file, window.location.href);
  if (url.origin !== window.location.origin) {
    throw new Error('不允许加载外部地址。');
  }
  if (!/\.md$/i.test(url.pathname)) {
    throw new Error('只允许预览 .md 文件。');
  }
  return url;
}

function setMetaLinks(mdUrl) {
  const decodedPath = decodeURIComponent(mdUrl.pathname);
  fileLabel.textContent = decodedPath;
  rawLink.href = mdUrl.href;

  const filename = decodeURIComponent(mdUrl.pathname.split('/').pop() || '设计说明.md');
  downloadLink.href = mdUrl.href;
  downloadLink.download = filename;

  const dir = mdUrl.pathname.slice(0, mdUrl.pathname.lastIndexOf('/') + 1);
  if (dir) backLink.href = `${dir}index.html`;
}

function decodeUtf8(buffer) {
  const text = new TextDecoder('utf-8').decode(buffer);
  return text.replace(/^\uFEFF/, '');
}

function fixRenderedLinks(mdUrl) {
  content.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#')) return;

    try {
      const target = new URL(href, mdUrl);
      link.href = target.href;
      if (target.origin !== window.location.origin) {
        link.target = '_blank';
        link.rel = 'noopener';
      }
    } catch {
      // Keep the original href if it cannot be resolved.
    }
  });

  content.querySelectorAll('img[src]').forEach((image) => {
    const src = image.getAttribute('src');
    if (!src) return;
    try {
      image.src = new URL(src, mdUrl).href;
    } catch {
      // Keep the original src if it cannot be resolved.
    }
  });

  content.querySelectorAll('input[type="checkbox"]').forEach((box) => {
    box.disabled = true;
    box.setAttribute('aria-label', box.checked ? '已完成' : '待确认');
  });
}

function setDocumentTitle() {
  const heading = content.querySelector('h1');
  const title = heading?.textContent?.trim() || '设计说明';
  document.title = `${title} · 柜子定制`;
}

async function loadDocument() {
  let mdUrl;

  try {
    mdUrl = resolveMarkdownUrl(getFileParam());
    setMetaLinks(mdUrl);
  } catch (error) {
    showError('无法打开设计说明', error.message);
    return;
  }

  if (!window.marked || typeof window.marked.parse !== 'function') {
    showError('Markdown 渲染脚本未加载', '请检查 assets/vendor/marked/marked.min.js 是否存在。');
    return;
  }

  try {
    const response = await fetch(mdUrl.href, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`服务器返回 ${response.status} ${response.statusText}`);
    }

    const markdown = decodeUtf8(await response.arrayBuffer());
    content.innerHTML = window.marked.parse(markdown, {
      gfm: true,
      breaks: false,
    });
    fixRenderedLinks(mdUrl);
    setDocumentTitle();

    loading.hidden = true;
    errorBox.hidden = true;
    content.hidden = false;
  } catch (error) {
    showError('设计说明加载失败', error.message);
  }
}

loadDocument();
