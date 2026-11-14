import React from 'react';
import './ProductTour.css';

const getYouTubeEmbedUrl = (url) => {
  const match = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : '';
};

const ProductTour = ({ compact = false }) => {
  const videoUrl = String(import.meta.env.VITE_PRODUCT_TOUR_VIDEO_URL || '').trim();
  const youtubeEmbedUrl = videoUrl ? getYouTubeEmbedUrl(videoUrl) : '';

  return (
    <section className={`product-tour${compact ? ' product-tour-compact' : ''}`} aria-label="GuruIBS product walkthrough">
      <div className="product-tour-copy">
        <span className="product-tour-eyebrow">A quick product tour</span>
        <h2>{compact ? 'See how GuruIBS works' : 'Your everyday retail workflow, in one place'}</h2>
        <p>Take a short look at managing stock, billing customers, and reviewing your business in GuruIBS.</p>
      </div>

      <div className="product-tour-frame">
        {youtubeEmbedUrl ? (
          <iframe
            src={youtubeEmbedUrl}
            title="GuruIBS product walkthrough"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : videoUrl ? (
          <video controls playsInline preload="metadata">
            <source src={videoUrl} />
            Your browser does not support embedded video.
          </video>
        ) : (
          <div className="product-tour-placeholder">
            <span className="product-tour-play" aria-hidden="true">▶</span>
            <strong>Walkthrough video coming soon</strong>
            <span>Our guided tour is being prepared. Check back soon.</span>
          </div>
        )}
      </div>
    </section>
  );
};

export default ProductTour;
