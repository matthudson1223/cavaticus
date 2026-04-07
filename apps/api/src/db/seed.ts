import 'dotenv/config';
import { db } from './index.js';
import { templates, blocks } from './schema.js';
import { eq } from 'drizzle-orm';

const TEMPLATES = [
  {
    name: 'Landing Page',
    description: 'Professional landing page with hero section and call-to-action',
    category: 'landing',
    thumbnailUrl: null,
    files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html>
<head>
  <title>Landing Page</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <nav class="navbar">
    <div class="container">
      <h1>Acme</h1>
      <ul>
        <li><a href="#features">Features</a></li>
        <li><a href="#pricing">Pricing</a></li>
        <li><a href="#contact">Contact</a></li>
      </ul>
    </div>
  </nav>

  <section class="hero">
    <div class="container">
      <h2>Welcome to Acme</h2>
      <p>Build amazing things with us</p>
      <button class="cta-btn">Get Started</button>
    </div>
  </section>

  <section id="features" class="features">
    <div class="container">
      <h3>Features</h3>
      <div class="feature-grid">
        <div class="feature-card">
          <h4>Fast</h4>
          <p>Blazing fast performance</p>
        </div>
        <div class="feature-card">
          <h4>Reliable</h4>
          <p>99.9% uptime guaranteed</p>
        </div>
        <div class="feature-card">
          <h4>Secure</h4>
          <p>Bank-level security</p>
        </div>
      </div>
    </div>
  </section>

  <script src="script.js"></script>
</body>
</html>`,
        mimeType: 'text/html',
      },
      {
        path: 'style.css',
        content: `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #333;
  line-height: 1.6;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

.navbar {
  background: #f8f9fa;
  padding: 20px 0;
  border-bottom: 1px solid #e9ecef;
}

.navbar h1 {
  display: inline-block;
  font-size: 24px;
}

.navbar ul {
  list-style: none;
  display: inline-block;
  float: right;
}

.navbar li {
  display: inline-block;
  margin-left: 30px;
}

.navbar a {
  text-decoration: none;
  color: #333;
  transition: color 0.3s;
}

.navbar a:hover {
  color: #007bff;
}

.hero {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  text-align: center;
  padding: 100px 20px;
}

.hero h2 {
  font-size: 48px;
  margin-bottom: 20px;
}

.hero p {
  font-size: 24px;
  margin-bottom: 40px;
}

.cta-btn {
  background: white;
  color: #667eea;
  padding: 15px 40px;
  font-size: 16px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: transform 0.3s;
}

.cta-btn:hover {
  transform: scale(1.05);
}

.features {
  padding: 80px 20px;
  background: #f8f9fa;
}

.features h3 {
  text-align: center;
  font-size: 36px;
  margin-bottom: 60px;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 30px;
}

.feature-card {
  background: white;
  padding: 30px;
  border-radius: 10px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.feature-card h4 {
  font-size: 20px;
  margin-bottom: 15px;
  color: #667eea;
}

@media (max-width: 768px) {
  .feature-grid {
    grid-template-columns: 1fr;
  }

  .navbar ul {
    float: none;
    display: block;
  }

  .navbar li {
    display: block;
    margin: 10px 0;
  }
}`,
        mimeType: 'text/css',
      },
      {
        path: 'script.js',
        content: `console.log('Landing page loaded');

document.querySelector('.cta-btn')?.addEventListener('click', () => {
  alert('Get started!');
});`,
        mimeType: 'application/javascript',
      },
    ],
  },
  {
    name: 'Portfolio',
    description: 'Showcase your work with this portfolio template',
    category: 'portfolio',
    thumbnailUrl: null,
    files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html>
<head>
  <title>Portfolio</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>John Doe</h1>
    <p class="subtitle">Web Developer & Designer</p>
  </header>

  <main>
    <section class="portfolio">
      <h2>My Work</h2>
      <div class="projects">
        <div class="project-card">
          <div class="project-image"></div>
          <h3>Project 1</h3>
          <p>Description of project 1</p>
        </div>
        <div class="project-card">
          <div class="project-image"></div>
          <h3>Project 2</h3>
          <p>Description of project 2</p>
        </div>
        <div class="project-card">
          <div class="project-image"></div>
          <h3>Project 3</h3>
          <p>Description of project 3</p>
        </div>
      </div>
    </section>

    <section class="about">
      <h2>About Me</h2>
      <p>I'm a passionate web developer with 5+ years of experience...</p>
    </section>
  </main>

  <footer>
    <p>&copy; 2024 John Doe. All rights reserved.</p>
  </footer>
</body>
</html>`,
        mimeType: 'text/html',
      },
      {
        path: 'style.css',
        content: `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Georgia', serif;
  color: #333;
  background: #fff;
}

header {
  background: #2c3e50;
  color: white;
  padding: 100px 20px;
  text-align: center;
}

header h1 {
  font-size: 48px;
  margin-bottom: 10px;
}

.subtitle {
  font-size: 20px;
  color: #bdc3c7;
}

main {
  max-width: 1000px;
  margin: 0 auto;
  padding: 60px 20px;
}

section {
  margin-bottom: 60px;
}

section h2 {
  font-size: 36px;
  margin-bottom: 40px;
  border-bottom: 2px solid #3498db;
  padding-bottom: 10px;
}

.projects {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 30px;
}

.project-card {
  background: #f8f9fa;
  border-radius: 5px;
  overflow: hidden;
  transition: transform 0.3s;
}

.project-card:hover {
  transform: translateY(-5px);
}

.project-image {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  height: 200px;
}

.project-card h3 {
  padding: 20px 20px 10px;
  font-size: 20px;
}

.project-card p {
  padding: 0 20px 20px;
  color: #666;
}

.about {
  background: #ecf0f1;
  padding: 40px;
  border-radius: 5px;
}

footer {
  background: #2c3e50;
  color: white;
  text-align: center;
  padding: 20px;
}

@media (max-width: 768px) {
  .projects {
    grid-template-columns: 1fr;
  }
}`,
        mimeType: 'text/css',
      },
    ],
  },
];

const SYSTEM_BLOCKS = [
  {
    name: 'Header',
    category: 'header',
    html: `<header class="site-header">
  <div class="container">
    <h1>Your Site</h1>
    <nav>
      <a href="#home">Home</a>
      <a href="#about">About</a>
      <a href="#contact">Contact</a>
    </nav>
  </div>
</header>`,
    css: `.site-header {
  background: #f8f9fa;
  padding: 20px 0;
  border-bottom: 1px solid #e9ecef;
}
.site-header h1 {
  display: inline-block;
  font-size: 24px;
}
.site-header nav {
  display: inline-block;
  float: right;
}
.site-header nav a {
  margin-left: 20px;
  text-decoration: none;
  color: #333;
}`,
    thumbnail: null,
  },
  {
    name: 'Hero',
    category: 'hero',
    html: `<section class="hero-section">
  <div class="hero-content">
    <h2>Welcome to Our Site</h2>
    <p>Discover amazing things</p>
    <button class="hero-btn">Learn More</button>
  </div>
</section>`,
    css: `.hero-section {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  text-align: center;
  padding: 100px 20px;
}
.hero-content h2 {
  font-size: 48px;
  margin-bottom: 20px;
}
.hero-content p {
  font-size: 24px;
  margin-bottom: 40px;
}
.hero-btn {
  background: white;
  color: #667eea;
  padding: 15px 40px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
}`,
    thumbnail: null,
  },
  {
    name: 'Footer',
    category: 'footer',
    html: `<footer class="site-footer">
  <div class="container">
    <div class="footer-content">
      <div class="footer-section">
        <h4>About</h4>
        <p>Learn more about us</p>
      </div>
      <div class="footer-section">
        <h4>Links</h4>
        <ul>
          <li><a href="#">Home</a></li>
          <li><a href="#">Services</a></li>
          <li><a href="#">Contact</a></li>
        </ul>
      </div>
      <div class="footer-section">
        <h4>Connect</h4>
        <ul>
          <li><a href="#">Twitter</a></li>
          <li><a href="#">Facebook</a></li>
          <li><a href="#">LinkedIn</a></li>
        </ul>
      </div>
    </div>
    <p class="footer-bottom">&copy; 2024 Your Company. All rights reserved.</p>
  </div>
</footer>`,
    css: `.site-footer {
  background: #2c3e50;
  color: white;
  padding: 40px 0 20px;
}
.footer-content {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin-bottom: 30px;
}
.footer-section h4 {
  margin-bottom: 15px;
}
.footer-section ul {
  list-style: none;
}
.footer-section a {
  color: #bdc3c7;
  text-decoration: none;
}
.footer-section a:hover {
  color: white;
}
.footer-bottom {
  text-align: center;
  border-top: 1px solid #34495e;
  padding-top: 20px;
  color: #bdc3c7;
}`,
    thumbnail: null,
  },
  {
    name: 'CTA Button',
    category: 'cta',
    html: `<div class="cta-container">
  <h3>Ready to get started?</h3>
  <button class="cta-button">Sign Up Now</button>
</div>`,
    css: `.cta-container {
  text-align: center;
  padding: 60px 20px;
  background: #f8f9fa;
}
.cta-container h3 {
  font-size: 28px;
  margin-bottom: 20px;
}
.cta-button {
  background: #667eea;
  color: white;
  padding: 15px 50px;
  border: none;
  border-radius: 5px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.3s;
}
.cta-button:hover {
  background: #764ba2;
}`,
    thumbnail: null,
  },
];

async function seed() {
  console.log('🌱 Seeding database...');

  try {
    // Seed templates
    for (const template of TEMPLATES) {
      const existing = await db
        .select()
        .from(templates)
        .where(eq(templates.name, template.name))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(templates).values({
          ...template,
          files: template.files as any,
        });
        console.log(`✓ Added template: ${template.name}`);
      }
    }

    // Seed system blocks
    for (const block of SYSTEM_BLOCKS) {
      const existing = await db
        .select()
        .from(blocks)
        .where(eq(blocks.name, block.name))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(blocks).values({
          ...block,
          userId: null, // System blocks have no owner
        } as any);
        console.log(`✓ Added block: ${block.name}`);
      }
    }

    console.log('✅ Seeding complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seed();
