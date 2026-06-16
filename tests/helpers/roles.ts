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
  "foreman:7": ["nav-tasks", "nav-materials", "nav-documents"],
  master: ["nav-tasks", "nav-photo-reports"],
  procurement_manager: ["nav-materials", "nav-objects"],
  estimator: ["nav-estimates", "nav-materials"],
};
