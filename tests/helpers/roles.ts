export const roles = {
  owner: "owner",
  constructionManager: "construction_manager",
  foremanAndrey: "foreman:7",
  master: "master",
  procurement: "procurement_manager",
  estimator: "estimator",
};

export const expectedVisibleByRole: Record<string, string[]> = {
  owner: ["nav-objects", "nav-tasks", "nav-materials", "nav-feedback"],
  construction_manager: ["nav-objects", "nav-tasks", "nav-materials"],
  "foreman:7": ["nav-objects", "nav-tasks", "nav-materials", "nav-photo-reports", "nav-object-issues", "nav-documents"],
  master: ["nav-tasks", "nav-photo-reports", "nav-object-issues"],
  procurement_manager: ["nav-materials", "nav-objects", "nav-photo-reports"],
  estimator: ["nav-estimates", "nav-materials", "nav-variations", "nav-photo-reports"],
};
