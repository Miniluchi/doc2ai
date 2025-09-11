/**
 * Middleware de validation des données
 */

/**
 * Valide les données de création d'une source
 */
export function validateSourceData(req, res, next) {
  const { name, platform, config } = req.body

  const errors = []

  // Validation du nom
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('Name is required and must be a non-empty string')
  } else if (name.length > 100) {
    errors.push('Name must be less than 100 characters')
  }

  // Validation de la plateforme
  const supportedPlatforms = ['sharepoint', 'googledrive', 'onedrive']
  if (!platform || !supportedPlatforms.includes(platform.toLowerCase())) {
    errors.push(`Platform must be one of: ${supportedPlatforms.join(', ')}`)
  }

  // Validation de la configuration
  if (!config || typeof config !== 'object') {
    errors.push('Config is required and must be an object')
  } else {
    // Validation des credentials
    if (!config.credentials || typeof config.credentials !== 'object') {
      errors.push('Config.credentials is required and must be an object')
    }

    // Validation spécifique par plateforme
    if (platform === 'sharepoint' || platform === 'onedrive') {
      const { clientId, clientSecret, tenantId } = config.credentials || {}
      if (!clientId) errors.push('Microsoft clientId is required')
      if (!clientSecret) errors.push('Microsoft clientSecret is required')
      if (!tenantId) errors.push('Microsoft tenantId is required')
      if (platform === 'sharepoint' && !config.siteUrl) {
        errors.push('SharePoint siteUrl is required')
      }
    }

    if (platform === 'googledrive') {
      const { clientId, clientSecret, refreshToken } = config.credentials || {}
      if (!clientId) errors.push('Google clientId is required')
      if (!clientSecret) errors.push('Google clientSecret is required')
      if (!refreshToken) errors.push('Google refreshToken is required')
    }

    // Validation des destinations
    if (config.destinations && !Array.isArray(config.destinations)) {
      errors.push('Config.destinations must be an array')
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    })
  }

  next()
}

/**
 * Valide les données de création d'un job de conversion
 */
export function validateConversionJobData(req, res, next) {
  const { sourceId, fileName, filePath, fileSize } = req.body

  const errors = []

  // Validation du sourceId
  if (!sourceId || typeof sourceId !== 'string') {
    errors.push('sourceId is required and must be a string')
  }

  // Validation du nom de fichier
  if (!fileName || typeof fileName !== 'string' || fileName.trim().length === 0) {
    errors.push('fileName is required and must be a non-empty string')
  } else {
    // Vérifier l'extension
    const supportedExtensions = ['.docx', '.doc', '.pdf']
    const extension = fileName.substring(fileName.lastIndexOf('.')).toLowerCase()
    if (!supportedExtensions.includes(extension)) {
      errors.push(`Unsupported file extension: ${extension}. Supported: ${supportedExtensions.join(', ')}`)
    }
  }

  // Validation du chemin de fichier
  if (!filePath || typeof filePath !== 'string' || filePath.trim().length === 0) {
    errors.push('filePath is required and must be a non-empty string')
  }

  // Validation de la taille (optionnelle)
  if (fileSize !== undefined && (typeof fileSize !== 'number' || fileSize < 0)) {
    errors.push('fileSize must be a positive number if provided')
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    })
  }

  next()
}

/**
 * Valide les paramètres de pagination
 */
export function validatePagination(req, res, next) {
  const { page, limit } = req.query

  if (page !== undefined) {
    const pageNum = parseInt(page)
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid page parameter. Must be a positive integer.'
      })
    }
    req.query.page = pageNum
  }

  if (limit !== undefined) {
    const limitNum = parseInt(limit)
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid limit parameter. Must be between 1 and 100.'
      })
    }
    req.query.limit = limitNum
  }

  next()
}

/**
 * Valide le format des IDs (CUID)
 */
export function validateId(paramName = 'id') {
  return (req, res, next) => {
    const id = req.params[paramName]
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: `${paramName} parameter is required`
      })
    }

    // Validation basique du format CUID (commence par 'c' suivi de caractères alphanumériques)
    if (!/^c[a-z0-9]{10,}$/i.test(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName} format`
      })
    }

    next()
  }
}

/**
 * Valide les filtres de statut pour les jobs
 */
export function validateJobStatus(req, res, next) {
  const { status } = req.query

  if (status !== undefined) {
    const validStatuses = ['pending', 'processing', 'completed', 'failed']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      })
    }
  }

  next()
}

/**
 * Sanitise les entrées utilisateur
 */
export function sanitizeInput(req, res, next) {
  // Fonction récursive pour nettoyer un objet
  function sanitize(obj) {
    if (typeof obj === 'string') {
      // Supprimer les caractères dangereux
      return obj.trim().replace(/[<>]/g, '')
    } else if (typeof obj === 'object' && obj !== null) {
      const sanitized = {}
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value)
      }
      return sanitized
    }
    return obj
  }

  if (req.body) {
    req.body = sanitize(req.body)
  }

  if (req.query) {
    req.query = sanitize(req.query)
  }

  next()
}

/**
 * Valide les limites de taille des requêtes
 */
export function validateRequestSize(maxSizeMB = 10) {
  return (req, res, next) => {
    const contentLength = parseInt(req.get('content-length'))
    const maxSizeBytes = maxSizeMB * 1024 * 1024

    if (contentLength > maxSizeBytes) {
      return res.status(413).json({
        success: false,
        message: 'Request too large',
        error: `Request size (${Math.round(contentLength / 1024 / 1024)}MB) exceeds limit (${maxSizeMB}MB)`
      })
    }

    next()
  }
}

/**
 * Valide le Content-Type pour les requêtes POST/PUT
 */
export function validateContentType(req, res, next) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('content-type')
    
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Content-Type',
        error: 'Expected application/json'
      })
    }
  }

  next()
}