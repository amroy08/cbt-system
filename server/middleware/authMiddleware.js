function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  
  // Check if API request (check absolute originalUrl)
  if (req.xhr || (req.originalUrl && req.originalUrl.startsWith('/api/')) || (req.headers.accept && req.headers.accept.indexOf('json') !== -1)) {
    return res.status(401).json({ error: 'Unauthorized: Admin session required' });
  }
  
  res.redirect('/admin/login.html');
}

module.exports = {
  requireAdmin
};
