(function () {
    const form = document.getElementById('break-submission-form');
    const feedback = document.getElementById('submit-feedback');

    if (!form || !feedback) {
        return;
    }

    function setFeedback(message, isError) {
        feedback.textContent = message;
        feedback.style.color = isError ? '#b91c1c' : '#374151';
    }

    function getValue(name) {
        const field = form.elements[name];
        return field ? field.value.trim() : '';
    }

    function validateYear(year) {
        if (!year) return true;
        if (!/^\d{4}$/.test(year)) return false;
        const numericYear = Number(year);
        return numericYear >= 1900 && numericYear <= 2100;
    }

    function validateDiscogsUrl(url) {
        if (!url) return true;
        return /^https?:\/\/(www\.)?discogs\.com\//i.test(url);
    }

    form.addEventListener('submit', function (event) {
        event.preventDefault();

        const artistName = getValue('artistName');
        const trackTitle = getValue('trackTitle');
        const albumTitle = getValue('albumTitle');
        const recordLabel = getValue('recordLabel');
        const year = getValue('year');
        const genre = getValue('genre');
        const style = getValue('style');
        const discogsUrl = getValue('discogsUrl');
        const youtubeUrl = getValue('youtubeUrl');
        const notes = getValue('notes');
        const contributorName = getValue('contributorName');
        const contributorEmail = getValue('contributorEmail');

        if (!artistName || !trackTitle) {
            setFeedback('Artist name and track title are required.', true);
            return;
        }

        if (!validateYear(year)) {
            setFeedback('Year must be a 4-digit number between 1900 and 2100.', true);
            return;
        }

        if (!validateDiscogsUrl(discogsUrl)) {
            setFeedback('Discogs URL must start with https://www.discogs.com/', true);
            return;
        }

        const issueTitle = `Break submission: ${artistName} - ${trackTitle}`;
        const issueBody = [
            '## New Drum Break Submission',
            '',
            `- **Artist Name:** ${artistName}`,
            `- **Album Title:** ${albumTitle || '(not provided)'}`,
            `- **Track Title:** ${trackTitle}`,
            `- **Record Label:** ${recordLabel || '(not provided)'}`,
            `- **Year:** ${year || '(not provided)'}`,
            `- **Genre:** ${genre || '(not provided)'}`,
            `- **Style:** ${style || '(not provided)'}`,
            `- **Discogs URL:** ${discogsUrl || '(not provided)'}`,
            `- **YouTube URL:** ${youtubeUrl || '(not provided)'}`,
            `- **Contributor Name:** ${contributorName || '(not provided)'}`,
            `- **Contributor Email:** ${contributorEmail || '(not provided)'}`,
            '',
            '### Notes',
            notes || '(none provided)',
            '',
            '---',
            'Submitted from the OpenDrumsOnly break submission form.'
        ].join('\n');

        const issueUrl =
            'https://github.com/pmoneynz/OpenDrumsOnly/issues/new' +
            `?title=${encodeURIComponent(issueTitle)}` +
            `&body=${encodeURIComponent(issueBody)}` +
            `&labels=${encodeURIComponent('submission,new-break')}`;

        window.open(issueUrl, '_blank', 'noopener');
        setFeedback('Opened a GitHub issue draft in a new tab. Submit it there to complete your contribution.', false);

        if (typeof gtag !== 'undefined') {
            gtag('event', 'break_submission_open_issue', {
                event_category: 'Submission',
                event_label: `${artistName} - ${trackTitle}`
            });
        }
    });
})();
