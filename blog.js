(function () {
    if (!document.body.classList.contains('blog-page')) {
        return;
    }

    const article = document.querySelector('.blog-article');
    if (!article) {
        return;
    }

    let commentsSection = article.querySelector('[data-blog-comments]');
    if (!commentsSection) {
        commentsSection = document.createElement('section');
        commentsSection.className = 'blog-comments';
        commentsSection.setAttribute('data-blog-comments', '');
        article.appendChild(commentsSection);
    }

    const articleHeading = article.querySelector('h2');
    const articleTitle = articleHeading ? articleHeading.textContent.trim() : document.title;
    const pageUrl = window.location.href;
    const issueTitle = `Comment thread: ${articleTitle}`;
    const issueBody = [
        `Page: ${pageUrl}`,
        '',
        'Write your comment below.',
        '',
        '---',
        'Opened from the OpenDrumsOnly blog comment section.'
    ].join('\n');

    const fallbackUrl =
        'https://github.com/pmoneynz/OpenDrumsOnly/issues/new' +
        `?title=${encodeURIComponent(issueTitle)}` +
        `&body=${encodeURIComponent(issueBody)}` +
        `&labels=${encodeURIComponent('blog-comment')}`;

    commentsSection.innerHTML = '';

    const heading = document.createElement('h3');
    heading.textContent = 'Comments';
    commentsSection.appendChild(heading);

    const intro = document.createElement('p');
    intro.textContent = 'Join the discussion. Comments are powered by GitHub Issues.';
    commentsSection.appendChild(intro);

    const status = document.createElement('p');
    status.className = 'blog-comments-status';
    status.textContent = 'Loading comment thread...';
    commentsSection.appendChild(status);

    const threadMount = document.createElement('div');
    threadMount.className = 'blog-comments-thread';
    commentsSection.appendChild(threadMount);

    const utterancesScript = document.createElement('script');
    utterancesScript.src = 'https://utteranc.es/client.js';
    utterancesScript.async = true;
    utterancesScript.crossOrigin = 'anonymous';
    utterancesScript.setAttribute('repo', 'pmoneynz/OpenDrumsOnly');
    utterancesScript.setAttribute('issue-term', 'pathname');
    utterancesScript.setAttribute('label', 'blog-comment');
    utterancesScript.setAttribute('theme', 'github-light');

    utterancesScript.addEventListener('load', function () {
        status.innerHTML =
            'If the widget does not appear, ' +
            `<a href="${fallbackUrl}" target="_blank" rel="noopener">open a comment issue on GitHub</a>.`;
    });

    utterancesScript.addEventListener('error', function () {
        status.innerHTML =
            'Could not load comments automatically. ' +
            `<a href="${fallbackUrl}" target="_blank" rel="noopener">Open a comment issue on GitHub</a>.`;
    });

    threadMount.appendChild(utterancesScript);
})();
