(function () {
    if (!document.body.classList.contains('blog-page')) {
        return;
    }

    const article = document.querySelector('.blog-article');
    if (!article) {
        return;
    }

    const entryCache = new Map();

    function normalizeImageSrc(src) {
        if (!src) return '';
        if (src.startsWith('../')) {
            return `/${src.slice(3)}`;
        }
        if (src.startsWith('./')) {
            return src.slice(1);
        }
        return src;
    }

    async function fetchEntryPreview(releaseId) {
        if (entryCache.has(releaseId)) {
            return entryCache.get(releaseId);
        }

        const request = fetch(`/entry/${releaseId}.html`, { credentials: 'same-origin' })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error(`Failed to load entry ${releaseId}`);
                }
                return response.text();
            })
            .then(function (html) {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const imageEl = doc.querySelector('.entry-image');
                const artist = (doc.querySelector('.entry-artist') || {}).textContent || '';
                const album = (doc.querySelector('.entry-album') || {}).textContent || '';

                let youtubeVideoId = '';
                const entryDataEl = doc.getElementById('entry-data');
                if (entryDataEl && entryDataEl.textContent) {
                    try {
                        const parsed = JSON.parse(entryDataEl.textContent);
                        youtubeVideoId = (parsed.youtubeVideoId || '').toString().replace(/[^a-zA-Z0-9_-]/g, '');
                    } catch {
                        youtubeVideoId = '';
                    }
                }

                return {
                    imageSrc: normalizeImageSrc(imageEl ? imageEl.getAttribute('src') : ''),
                    imageAlt: [artist.trim(), album.trim()].filter(Boolean).join(' - ') || 'Album cover',
                    youtubeVideoId
                };
            })
            .catch(function () {
                return null;
            });

        entryCache.set(releaseId, request);
        return request;
    }

    function createMediaBlock(linkHref, preview) {
        if (!preview || !preview.imageSrc) {
            return null;
        }

        const media = document.createElement('div');
        media.className = 'break-media';

        const coverLink = document.createElement('a');
        coverLink.href = linkHref;
        coverLink.className = 'break-cover-link';
        coverLink.setAttribute('aria-label', 'See more record details');

        const cover = document.createElement('img');
        cover.className = 'break-cover';
        cover.loading = 'lazy';
        cover.decoding = 'async';
        cover.src = preview.imageSrc;
        cover.alt = preview.imageAlt;
        cover.onerror = function () {
            cover.src = '/images/NotFound.jpeg';
        };
        coverLink.appendChild(cover);
        media.appendChild(coverLink);

        if (preview.youtubeVideoId) {
            const details = document.createElement('details');
            details.className = 'break-video';
            details.innerHTML = `
                <summary>Watch break clip</summary>
                <div class="yt-embed">
                    <iframe
                        src="https://www.youtube-nocookie.com/embed/${preview.youtubeVideoId}"
                        title="YouTube break preview"
                        frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowfullscreen
                        loading="lazy"
                    ></iframe>
                </div>
            `;
            media.appendChild(details);
        }

        return media;
    }

    async function enhanceBreakLists() {
        const items = Array.from(article.querySelectorAll('.break-list li'));
        if (!items.length) {
            return;
        }

        const targets = [];
        for (const item of items) {
            const link = item.querySelector('.break-entry-link');
            if (!link) {
                continue;
            }

            // Normalize CTA wording across all list posts.
            link.textContent = 'See more';

            const match = (link.getAttribute('href') || '').match(/\/entry\/(\d+)\.html/i);
            if (!match) {
                continue;
            }

            targets.push({ item, link, releaseId: match[1] });
        }

        await Promise.all(targets.map(async function (target) {
            const preview = await fetchEntryPreview(target.releaseId);
            if (!preview || target.item.querySelector('.break-media')) {
                return;
            }

            const media = createMediaBlock(target.link.href, preview);
            if (media) {
                target.item.appendChild(media);
            }
        }));
    }

    function setupComments() {
        let commentsSection = article.querySelector('[data-blog-comments]');
        if (!commentsSection) {
            commentsSection = document.createElement('section');
            commentsSection.className = 'blog-comments';
            commentsSection.setAttribute('data-blog-comments', '');
            article.appendChild(commentsSection);
        }

        commentsSection.innerHTML = '';

        const heading = document.createElement('h3');
        heading.textContent = 'Comments';
        commentsSection.appendChild(heading);

        const intro = document.createElement('p');
        intro.textContent = 'Join the discussion below. Sign-in options are provided by Disqus (including guest/social options when available).';
        commentsSection.appendChild(intro);

        const status = document.createElement('p');
        status.className = 'blog-comments-status';
        status.textContent = 'Loading comments...';
        commentsSection.appendChild(status);

        const threadMount = document.createElement('div');
        threadMount.className = 'blog-comments-thread';
        threadMount.id = 'disqus_thread';
        commentsSection.appendChild(threadMount);

        const shortname = 'opendrumsonly';
        const articleHeading = article.querySelector('h2');
        const articleTitle = articleHeading ? articleHeading.textContent.trim() : document.title;
        const pageUrl = window.location.href.split('#')[0];
        const pageIdentifier = window.location.pathname;

        window.disqus_config = function () {
            this.page.url = pageUrl;
            this.page.identifier = pageIdentifier;
            this.page.title = articleTitle;
        };

        const script = document.createElement('script');
        script.src = `https://${shortname}.disqus.com/embed.js`;
        script.async = true;
        script.setAttribute('data-timestamp', String(Date.now()));

        script.addEventListener('load', function () {
            status.textContent = 'Comments loaded. Choose any available sign-in method in the comment box.';
        });

        script.addEventListener('error', function () {
            status.innerHTML = 'Could not load comments. You can still share feedback via the ' +
                '<a href="/submit-break.html">submission form</a>.';
        });

        commentsSection.appendChild(script);
    }

    enhanceBreakLists();
    setupComments();
})();
