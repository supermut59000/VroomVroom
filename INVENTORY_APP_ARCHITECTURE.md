# INVENTORY_APP_ARCHITECTURE
## Project Overview

A personal inventory management app to track owned (and wished-for) items across multiple categories: manga, Pop Funko, clothes, tech, video games, books, and any custom category the user creates.

The key technical challenge is a **flexible schema**: each category defines its own custom fields, and items store their data as JSON validated against that schema.

---

## Tech Stack

|Layer|Technology|
|---|---|
|Backend|FastAPI (Python 3.12)|
|Database|MariaDB 11.2|
|ORM|SQLAlchemy 2.0 (async)|
|Validation|Pydantic v2|
|Frontend|React 18 + Vite|
|Styling|Tailwind CSS + shadcn/ui|
|State|React Query (TanStack Query v5)|
|Containerization|Docker + Docker Compose|

---

## Project Structure
```

mystuff/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── database.py
│   │   ├── models/
│   │   │   ├── category.py
│   │   │   └── item.py
│   │   ├── schemas/
│   │   │   ├── category.py
│   │   │   └── item.py
│   │   ├── services/
│   │   │   ├── category_service.py
│   │   │   └── item_service.py
│   │   └── api/
│   │       ├── deps.py
│   │       └── routes/
│   │           ├── categories.py
│   │           └── items.py
│   ├── migrations/
│   │   └── 001_init.sql
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_categories.py
│   │   └── test_items.py
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.local
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Header.tsx           # App name, dark mode toggle, search bar
│   │   │   │   └── Sidebar.tsx          # Category list with icons + item counts
│   │   │   ├── dashboard/
│   │   │   │   └── Dashboard.tsx        # Overview: stats + category cards grid
│   │   │   ├── categories/
│   │   │   │   ├── CategoryCard.tsx     # Card shown on dashboard
│   │   │   │   └── CategoryFormDialog.tsx  # Create/edit category + field editor
│   │   │   ├── items/
│   │   │   │   ├── ItemGrid.tsx         # Grid of ItemCards for selected category
│   │   │   │   ├── ItemCard.tsx         # Card (photo, name, condition badge)
│   │   │   │   ├── ItemViewDialog.tsx   # View details + CSV export button
│   │   │   │   ├── ItemFormDialog.tsx   # Create/edit (dynamic fields from category)
│   │   │   │   └── ItemFilters.tsx      # Search, sort, condition, owned/wishlist
│   │   │   └── ui/                      # shadcn components
│   │   ├── hooks/
│   │   │   ├── use-categories.ts
│   │   │   └── use-items.ts
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   └── csv.ts
│   │   ├── App.tsx                      # ThemeProvider + layout shell
│   │   └── main.tsx
│   ├── public/
│   │   └── sw.js
│   ├── Dockerfile
│   └── package.json
└── docker-compose.yml
```

---

## Database Schema

```sql
CREATE TABLE categories (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    icon        VARCHAR(10)  NOT NULL DEFAULT '📦',
    description TEXT,
    custom_fields JSON NOT NULL DEFAULT '[]',
    -- custom_fields: array of field definition objects
    -- [{ "key": "serie", "label": "Série", "type": "text",
    --    "required": true, "options": null }]
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE items (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    category_id  INT NOT NULL,
    name         VARCHAR(255) NOT NULL,
    description  TEXT,
    condition    ENUM('mint','good','fair','poor') DEFAULT 'good',
    is_owned     BOOLEAN DEFAULT TRUE,  -- FALSE = wishlist
    value        DECIMAL(10,2),         -- estimated value in EUR
    custom_data  JSON NOT NULL DEFAULT '{}',
    -- custom_data: key/value pairs matching category custom_fields
    -- { "serie": "Naruto", "tome": 1, "auteur": "Kishimoto" }
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
);

-- Indexes
CREATE INDEX idx_items_category_id ON items(category_id);
CREATE INDEX idx_items_is_owned    ON items(is_owned);
CREATE INDEX idx_items_condition   ON items(condition);
CREATE INDEX idx_items_name        ON items(name);
CREATE FULLTEXT INDEX idx_items_name_ft ON items(name);
```

### Field Types Supported in `custom_fields`

|Type|Description|Example|
|---|---|---|
|`text`|Free text input|auteur, marque|
|`number`|Numeric input|tome, numéro|
|`boolean`|Checkbox|exclusive|
|`select`|Dropdown with options|taille, plateforme|
|`date`|Date picker|garantie_fin|

---

## Pydantic Schemas

### Custom Field Definition

```python
# schemas/category.py
from pydantic import BaseModel, model_validator
from typing import Literal, Optional

FieldType = Literal["text", "number", "boolean", "select", "date"]

class CustomFieldDefinition(BaseModel):
    key:      str
    label:    str
    type:     FieldType
    required: bool = False
    options:  Optional[list[str]] = None  # only for type="select"

    @model_validator(mode="after")
    def options_required_for_select(self) -> "CustomFieldDefinition":
        if self.type == "select" and not self.options:
            raise ValueError(
                f"Field '{self.key}' is type 'select' but has no options defined."
            )
        if self.type != "select" and self.options is not None:
            raise ValueError(
                f"Field '{self.key}' is type '{self.type}' "
                f"but options are only valid for 'select'."
            )
        return self
```

### Category Schemas

```python
class CategoryBase(BaseModel):
    name:          str
    icon:          str = "📦"
    description:   Optional[str] = None
    custom_fields: list[CustomFieldDefinition] = []

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name:          Optional[str] = None
    icon:          Optional[str] = None
    description:   Optional[str] = None
    custom_fields: Optional[list[CustomFieldDefinition]] = None

class CategoryResponse(CategoryBase):
    id:         int
    item_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
```

### Item Schemas

```python
# schemas/item.py
from pydantic import BaseModel, ConfigDict
from typing import Optional, Any
from decimal import Decimal
from datetime import datetime

class ItemBase(BaseModel):
    name:        str
    description: Optional[str] = None
    condition:   Literal["mint", "good", "fair", "poor"] = "good"
    is_owned:    bool = True
    deployment_status ENUM nullable 
    wear_status ENUM nullable 
    reading_status ENUM nullable
    value:       Optional[Decimal] = None
    custom_data: dict[str, Any] = {}

class ItemCreate(ItemBase):
    category_id: int

class ItemUpdate(BaseModel):
    name:        Optional[str] = None
    description: Optional[str] = None
    condition:   Optional[Literal["mint", "good", "fair", "poor"]] = None
    is_owned:    Optional[bool] = None
    value:       Optional[Decimal] = None
    custom_data: Optional[dict[str, Any]] = None

class ItemResponse(ItemBase):
    id:          int
    category_id: int
    created_at:  datetime
    updated_at:  datetime

    model_config = ConfigDict(from_attributes=True)

class ItemListResponse(BaseModel):
    items:    list[ItemResponse]
    total:    int
    page:     int
    per_page: int
    pages:    int
```

---

## Custom Data Validation Strategy

Custom field validation happens in the **service layer** when creating or updating an item. The approach:

1. Load the item's category and its `custom_fields` definition from the database.
2. Iterate over defined fields and validate each one.
3. Strip unknown keys from `custom_data` (silently ignored — not an error).
4. Raise typed `422` errors for any violation.

```python
# services/item_service.py

def validate_custom_data(
    custom_data: dict,
    custom_fields: list[CustomFieldDefinition]
) -> dict:
    """
    Validates custom_data against the category's custom_fields definition.
    Returns a cleaned dict (unknown keys stripped).
    Raises HTTPException 422 on validation failure.
    """
    errors = []
    cleaned = {}

    field_map = {f.key: f for f in custom_fields}

    # Validate defined fields
    for key, field_def in field_map.items():
        value = custom_data.get(key)

        # Required check
        if field_def.required and (value is None or value == ""):
            errors.append(f"Field '{field_def.label}' is required.")
            continue

        if value is None:
            continue  # Optional field not provided — skip

        # Type check
        if field_def.type == "number" and not isinstance(value, (int, float)):
            errors.append(
                f"Field '{field_def.label}' must be a number, "
                f"got {type(value).__name__}."
            )
        elif field_def.type == "boolean" and not isinstance(value, bool):
            errors.append(
                f"Field '{field_def.label}' must be a boolean."
            )
        elif field_def.type == "select" and value not in field_def.options:
            errors.append(
                f"Field '{field_def.label}' must be one of: "
                f"{', '.join(field_def.options)}. Got '{value}'."
            )
        elif field_def.type in ("text", "date") and not isinstance(value, str):
            errors.append(
                f"Field '{field_def.label}' must be a string."
            )
        else:
            cleaned[key] = value

    if errors:
        raise HTTPException(
            status_code=422,
            detail={"message": "Custom data validation failed", "errors": errors}
        )

    return cleaned
```

**Rules summary:**


|Scenario|Behaviour|
|---|---|
|Required field missing|422 with field label in error|
|Wrong type for field|422 with expected/got detail|
|Select value not in options|422 with allowed values listed|
|Unknown key in custom_data|Silently stripped|
|Optional field absent|Accepted, stored as absent|

---

## Error Handling

### HTTP Exception Patterns


|Scenario|Status|Detail|
|---|---|---|
|Category not found|404|`"Category {id} not found"`|
|Item not found|404|`"Item {id} not found"`|
|Delete category with items|400|`"Cannot delete category with existing items. Move or delete items first."`|
|Duplicate category name|400|`"Category name '{name}' already exists."`|
|Custom data validation fail|422|`{ "message": "...", "errors": [...] }`|
|Required custom field missing|422|`"Field '{label}' is required."`|
|Invalid field type|422|`"Field '{label}' must be a {type}."`|
|Invalid select value|422|`"Field '{label}' must be one of: ..."`|

### Standardized Error Response Format

```json
{
  "detail": {
    "message": "Custom data validation failed",
    "errors": [
      "Field 'Tome' must be a number, got str.",
      "Field 'Série' is required."
    ]
  }
}
```

For simple errors, `detail` is a plain string:

```json
{ "detail": "Category 42 not found" }
```

---

## API Endpoints

### Categories

```
GET    /api/categories              → list all categories (with item_count)
POST   /api/categories              → create category
GET    /api/categories/{id}         → get one category
PUT    /api/categories/{id}         → update category
DELETE /api/categories/{id}         → delete (fails if items exist)
```

### Items

```
GET    /api/items                   → list items (paginated, filtered)
POST   /api/items                   → create item
GET    /api/items/{id}              → get one item
PUT    /api/items/{id}              → update item
DELETE /api/items/{id}              → delete item

GET    /api/items/export/csv        → CSV export of filtered items
```

### Dashboard

```
GET    /api/dashboard/stats         → aggregate stats
```

Stats response:

```json
{
  "total_items":    142,
  "total_owned":    130,
  "total_wishlist":  12,
  "total_value":  2340.50,
  "by_category": [
    { "category_id": 1, "name": "Manga", "icon": "📚",
      "count": 45, "wishlist_count": 3 }
  ]
}
```

---

## Pagination, Sorting & Filtering

### Query Parameters for `GET /api/items`


|Parameter|Type|Default|Description|
|---|---|---|---|
|`page`|int|`1`|Page number (1-based)|
|`per_page`|int|`20`|Items per page (max 100)|
|`category_id`|int|—|Filter by category|
|`is_owned`|bool|—|`true` = owned, `false` = wishlist|
|`condition`|str|—|`mint/good/fair/poor`|
|`search`|str|—|Text search on `name`|
|`sort`|str|`created_at`|Sort field: `name`, `created_at`, `value`|
|`order`|str|`desc`|`asc` or `desc`|

### Search Strategy

- **Primary**: SQL `LIKE %search%` on `items.name` (fast, indexed)
- **v2**: Full-text search via `MATCH(name) AGAINST(search IN BOOLEAN MODE)`
- **JSON fields**: Filtering/sorting on `custom_data` keys is deferred to v2 (JSON column queries are non-trivial and have performance implications)

### Default Sort

`created_at DESC` — newest items first.

### List Response Format

```json
{
  "items": [...],
  "total": 142,
  "page": 1,
  "per_page": 20,
  "pages": 8
}
```

---

## Navigation & Dialog Pattern

No router. Navigation is sidebar-driven state. Everything opens in dialogs (same pattern as VroomVroom).

```tsx
// App.tsx — layout shell, no router
function App() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [showWishlist, setShowWishlist] = useState(false);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" storageKey="mystuff-theme">
      <div className="flex h-screen">
        <Sidebar
          onSelectCategory={setSelectedCategoryId}
          onSelectWishlist={() => setShowWishlist(true)}
          selectedCategoryId={selectedCategoryId}
        />
        <main className="flex-1 overflow-auto">
          <Header />
          {selectedCategoryId === null && !showWishlist
            ? <Dashboard onSelectCategory={setSelectedCategoryId} />
            : <ItemGrid
                categoryId={selectedCategoryId}
                wishlistOnly={showWishlist}
              />
          }
        </main>
      </div>
    </ThemeProvider>
  );
}
```

**Dialog flow:**
- Click category in sidebar → `ItemGrid` renders (same view, state change)
- Click "+" button → `ItemFormDialog` opens (create)
- Click item card → `ItemViewDialog` opens (view + edit + delete + CSV)
- Click edit in view dialog → `ItemFormDialog` opens (edit)
- Click category settings → `CategoryFormDialog` opens

No URL changes. No back button needed. This matches VroomVroom's modal pattern exactly.

### React Query — Cache Invalidation Strategy


|Action|Invalidates|
|---|---|
|Create item|`["items", categoryId]`, `["dashboard-stats"]`, `["categories"]`|
|Update item|`["items", id]`, `["items", categoryId]`, `["dashboard-stats"]`|
|Delete item|`["items", categoryId]`, `["dashboard-stats"]`, `["categories"]`|
|Create category|`["categories"]`, `["dashboard-stats"]`|
|Update category|`["categories"]`, `["category", id]`|
|Delete category|`["categories"]`, `["dashboard-stats"]`|

No optimistic updates in v1 (adds complexity, deferred to v2).

The sidebar category list uses `["categories"]` — it refetches automatically when any item is mutated because item counts are included in the category response.

---

## Frontend API Client

```typescript
// lib/api.ts
const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8056";
const API_KEY  = import.meta.env.VITE_API_KEY  ?? "";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(
      typeof error.detail === "string"
        ? error.detail
        : JSON.stringify(error.detail)
    );
  }

  return res.json();
}

export const api = {
  get:    <T>(path: string)              => request<T>(path),
  post:   <T>(path: string, body: unknown) =>
            request<T>(path, { method: "POST",  body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown) =>
            request<T>(path, { method: "PUT",   body: JSON.stringify(body) }),
  delete: <T>(path: string)             =>
            request<T>(path, { method: "DELETE" }),
};
```

---

## Dynamic Form Rendering

Each category stores its `custom_fields` as a JSON array. The `ItemForm` component reads this array and renders the appropriate input for each field.

```tsx
// components/items/ItemForm.tsx (simplified)
function renderCustomField(field: CustomFieldDefinition) {
  switch (field.type) {
    case "text":
      return <TextInput    key={field.key} label={field.label} />;
    case "number":
      return <NumberInput  key={field.key} label={field.label} />;
    case "boolean":
      return <Checkbox     key={field.key} label={field.label} />;
    case "select":
      return <SelectInput  key={field.key} label={field.label}
                           options={field.options} />;
    case "date":
      return <DatePicker   key={field.key} label={field.label} />;
  }
}

// In the form:
{category.custom_fields.map(renderCustomField)}
```

---

## Category Navigation

The sidebar lists all categories with their icon and item count. Clicking one navigates to `/category/:id`. The Dashboard is the "all categories" overview.

The sidebar uses the `["categories"]` React Query cache which includes `item_count` per category, so counts stay up to date after mutations.

---

## Wishlist Behaviour

Items with `is_owned = false` represent the wishlist.


|Aspect|Behaviour|
|---|---|
|Route|`/wishlist` shows all items where `is_owned = false`|
|Dashboard stats|Wishlist count shown separately; total value excludes wishlist|
|Category page|Toggle button: "Owned" / "Wishlist" / "All"|
|Acquiring|"Mark as owned" button sets `is_owned = true`|
|Item form|`is_owned` checkbox present on create and edit|
|Sidebar|Wishlist link with total wishlist count badge|

---

## Seed SQL — `migrations/001_init.sql`

```sql
-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(100) NOT NULL UNIQUE,
    icon          VARCHAR(10)  NOT NULL DEFAULT '📦',
    description   TEXT,
    custom_fields JSON         NOT NULL DEFAULT '[]',
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT            NOT NULL,
    name        VARCHAR(255)   NOT NULL,
    description TEXT,
    condition   ENUM('mint','good','fair','poor') DEFAULT 'good',
    is_owned    BOOLEAN        DEFAULT TRUE,
    value       DECIMAL(10,2),
    custom_data JSON           NOT NULL DEFAULT '{}',
    created_at  DATETIME       DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME       DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
);

CREATE INDEX        idx_items_category_id ON items(category_id);
CREATE INDEX        idx_items_is_owned    ON items(is_owned);
CREATE INDEX        idx_items_condition   ON items(condition);
CREATE INDEX        idx_items_name        ON items(name);
CREATE FULLTEXT INDEX idx_items_name_ft   ON items(name);

-- ============================================================
-- Preset Categories
-- ============================================================

INSERT INTO categories (name, icon, description, custom_fields) VALUES
(
  'Manga', '📚', 'Mangas et manhwas',
  '[
    {"key":"serie",   "label":"Série",   "type":"text",   "required":true,  "options":null},
    {"key":"tome",    "label":"Tome",    "type":"number", "required":true,  "options":null},
    {"key":"auteur",  "label":"Auteur",  "type":"text",   "required":false, "options":null},
    {"key":"editeur", "label":"Éditeur", "type":"text",   "required":false, "options":null},
    {"key":"langue",  "label":"Langue",  "type":"text",   "required":false, "options":null}
  ]'
),
(
  'Pop Funko', '🎭', 'Figurines Pop Funko',
  '[
    {"key":"serie",     "label":"Série",     "type":"text",    "required":true,
     "options":null},
    {"key":"numero",    "label":"Numéro",    "type":"number",  "required":false,
     "options":null},
    {"key":"exclusive", "label":"Exclusive", "type":"boolean", "required":false,
     "options":null},
    {"key":"boite",     "label":"Boîte",     "type":"select",  "required":false,
     "options":["oui","non","abîmée"]}
  ]'
),
(
  'Vêtements', '👕', 'Vêtements et accessoires',
  '[
    {"key":"marque",  "label":"Marque",   "type":"text",   "required":false, "options":null},
    {"key":"taille",  "label":"Taille",   "type":"select", "required":false,
     "options":["XS","S","M","L","XL","XXL"]},
    {"key":"couleur", "label":"Couleur",  "type":"text",   "required":false, "options":null},
    {"key":"matiere", "label":"Matière",  "type":"text",   "required":false, "options":null}
  ]'
),
(
  'Tech', '💻', 'Appareils et accessoires tech',
  '[
    {"key":"marque",       "label":"Marque",        "type":"text",   "required":false,
     "options":null},
    {"key":"modele",       "label":"Modèle",        "type":"text",   "required":false,
     "options":null},
    {"key":"numero_serie", "label":"Numéro de série","type":"text",  "required":false,
     "options":null},
    {"key":"garantie_fin", "label":"Fin de garantie","type":"date",  "required":false,
     "options":null}
  ]'
),
(
  'Jeux Vidéo', '🎮', 'Jeux vidéo toutes plateformes',
  '[
    {"key":"plateforme", "label":"Plateforme", "type":"select", "required":true,
     "options":["PS5","PS4","Switch","PC","Xbox","Other"]},
    {"key":"editeur",    "label":"Éditeur",    "type":"text",   "required":false,
     "options":null},
    {"key":"genre",      "label":"Genre",      "type":"text",   "required":false,
     "options":null}
  ]'
),
(
  'Livres', '📖', 'Romans, BD et essais',
  '[
    {"key":"auteur",  "label":"Auteur",   "type":"text", "required":false, "options":null},
    {"key":"editeur", "label":"Éditeur",  "type":"text", "required":false, "options":null},
    {"key":"isbn",    "label":"ISBN",     "type":"text", "required":false, "options":null},
    {"key":"genre",   "label":"Genre",    "type":"text", "required":false, "options":null}
  ]'
);
```

---

## Environment Variables

### Backend — `backend/.env.local`

```dotenv
# Database
DB_HOST=mariadb
DB_PORT=3306
DB_USER=mystuff
DB_PASSWORD=mystuff
DB_NAME=mystuff

# App
API_HOST=0.0.0.0
API_PORT=8000
DEBUG=true

# Security
API_KEY=change-me-in-production
CORS_ORIGINS=http://localhost:3056

# Uploads (v2)
UPLOAD_DIR=/app/uploads
MAX_UPLOAD_SIZE_MB=5
```

### Frontend — `frontend/.env.local`

```dotenv
VITE_API_URL=http://localhost:8056
VITE_API_KEY=change-me-in-production
```

### `config.py`

```python
# core/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DB_HOST:     str = "localhost"
    DB_PORT:     int = 3306
    DB_USER:     str = "mystuff"
    DB_PASSWORD: str = "mystuff"
    DB_NAME:     str = "mystuff"

    API_HOST:    str  = "0.0.0.0"
    API_PORT:    int  = 8000
    DEBUG:       bool = False

    API_KEY:      str  = "change-me"
    CORS_ORIGINS: str  = "http://localhost:3056"

    UPLOAD_DIR:        str = "/app/uploads"
    MAX_UPLOAD_SIZE_MB: int = 5

    @property
    def DATABASE_URL(self) -> str:
        return (
            f"mysql+aiomysql://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    model_config = {"env_file": ".env.local"}

settings = Settings()
```

---

## Logging

```python
# core/logging.py
import logging
import sys

def setup_logging(debug: bool = False) -> None:
    level = logging.DEBUG if debug else logging.INFO
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    ))
    logging.basicConfig(level=level, handlers=[handler])
```


|Event|Level|What is logged|
|---|---|---|
|App startup|INFO|Port, debug mode, DB URL (no password)|
|Request in|INFO|Method + path (via middleware)|
|DB query error|ERROR|Full traceback|
|404|WARNING|Path + resource ID|
|422 validation|WARNING|Validation errors list|
|Item created|INFO|Item ID + category ID|
|Item deleted|INFO|Item ID|
|Category deleted|INFO|Category ID + name|
|Unknown exception|ERROR|Full traceback|

---

## Image Upload — v2 Plan

Image upload is deferred to Phase 3 but the approach is decided now to avoid architectural mistakes in v1.


|Concern|Decision|
|---|---|
|Storage|Local filesystem volume (`/app/uploads/`) mounted via Docker|
|Path pattern|`/uploads/{item_id}/{uuid}.jpg`|
|Max size|5 MB (enforced in FastAPI before writing to disk)|
|Processing|Resize to max 1200 × 1200 px; generate 200 × 200 thumbnail|
|Serving|Nginx static file serving from the uploads volume|
|DB column|`image_path VARCHAR(500)` added to `items` in a v2 migration|
|v1 impact|No `image_path` column in v1; add in migration `002_add_images.sql`|

---

## Migration Strategy


|Phase|Tool|Approach|
|---|---|---|
|v1|Plain SQL|`001_init.sql` runs automatically via Docker entrypoint|
|v2+|Alembic|Introduced when schema changes are needed post-launch|

Adding Alembic in v2:

```bash
alembic init migrations
alembic revision --autogenerate -m "add image_path to items"
alembic upgrade head
```

The v1 SQL baseline becomes the Alembic starting point via `alembic stamp head` on first Alembic run.

---

## Bulk Operations — v2 Plan

No bulk operations in v1. Planned v2 endpoints (require no schema changes):

```
DELETE /api/items/bulk        body: { "ids": [1, 2, 3] }
PUT    /api/items/bulk-update  body: { "ids": [1,2,3], "patch": { "condition": "good" } }
POST   /api/items/bulk-move    body: { "ids": [1,2,3], "category_id": 5 }
```

---

## Docker Setup

```yaml
# docker-compose.yml
services:
  mariadb:
    image: mariadb:11.2
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE:      mystuff
      MYSQL_USER:          mystuff
      MYSQL_PASSWORD:      mystuff
    ports:
      - "3306:3306"
    volumes:
      - mariadb-data:/var/lib/mysql
      - ./backend/migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test:     ["CMD", "healthcheck.sh", "--connect"]
      interval: 10s
      timeout:  5s
      retries:  5

  backend:
    build: ./backend
    ports:
      - "8056:8000"
    env_file:
      - ./backend/.env.local
    volumes:
      - uploads-data:/app/uploads   # v2 ready
    depends_on:
      mariadb:
        condition: service_healthy

  frontend:
    build: ./frontend
    ports:
      - "3056:3000"
    depends_on:
      - backend

volumes:
  mariadb-data:
  uploads-data:
```

Ports: **3056** (frontend) and **8056** (backend) — no conflict with VroomVroom.

---

## Preset Categories


|Category|Icon|Custom Fields|
|---|---|---|
|Manga|📚|série (req), tome (number, req), auteur, éditeur, langue|
|Pop Funko|🎭|série (req), numéro (number), exclusive (boolean), boîte (select: oui/non/abîmée)|
|Vêtements|👕|marque, taille (select: XS/S/M/L/XL/XXL), couleur, matière|
|Tech|💻|marque, modèle, numéro_série, garantie_fin (date)|
|Jeux Vidéo|🎮|plateforme (select: PS5/PS4/Switch/PC/Xbox/Other, req), éditeur, genre|
|Livres|📖|auteur, éditeur, isbn, genre|
### Preset Custom Fields per Category

These go in `custom_fields` on the category definition, pre-filled at seed time so the user doesn't have to create them manually.

**Manga**

|Field|Type|
|---|---|
|`series_name`|text|
|`volume_number`|number|
|`author`|text|
|`publisher`|text|
|`cover_image_url`|text (filled by ISBN lookup)|

**Vêtements**

|Field|Type|
|---|---|
|`brand`|text|
|`size`|text|
|`color`|text|
|`season`|select: `spring_summer`, `fall_winter`, `all_season`|
|`times_worn`|number|
|`purchase_price`|number|

**Tech**

|Field|Type|
|---|---|
|`brand`|text|
|`model`|text|
|`serial_number`|text|
|`assigned_to`|text (which machine)|
|`purchase_price`|number|
|`purchase_date`|date|
|`specs`|text (free form for now)|
The user can add, edit, or delete categories at any time.

---

## Implementation Order

### Phase 1 — Foundation

1. Backend: database models, migrations, config, Docker
2. Backend: category CRUD (endpoints + service)
3. Backend: item CRUD with custom_data JSON validation
4. Frontend: project setup (Vite, Tailwind, shadcn)
5. Frontend: layout (Header, Sidebar)
6. Frontend: dashboard with category cards

### Phase 2 — Core UX

7. Frontend: category page (item grid with filters + pagination)
8. Frontend: dynamic item form (from custom_fields)
9. Frontend: item detail dialog
10. Backend + Frontend: search
11. Backend + Frontend: dashboard stats
12. Dark mode, CSV export (copy from VroomVroom)
13. Wishlist page and toggle

### Phase 3 — Polish

14. Image upload (item photos)
15. Tags system
16. Bulk operations (delete, move, update)
17. PWA / Service Worker (copy pattern from VroomVroom)
18. API key auth (copy from VroomVroom)
19. Tests
20. Alembic migration setup
21. Barcode / ISBN scanner (ZXing + Open Library API) 
22. reading_status ENUM column on items (manga + books)
23. Volume tracker:
	- Series metadata from AniList API (GraphQL)
	- Completion % = owned volumes / total volumes
	- Missing volumes list = auto calculated
	- FR release dates = manual input (no reliable API exists)

---

## What to Copy from VroomVroom


|What|Source|
|---|---|
|FastAPI project structure|`backend/app/` layout|
|Config + .env pattern|`backend/app/core/config.py`|
|Database setup|`backend/app/core/database.py`|
|Dependency injection|`backend/app/api/deps.py`|
|API key auth|`backend/app/api/deps.py` → `verify_api_key`|
|Service layer pattern|Any `backend/app/services/*.py`|
|Test infrastructure|`backend/tests/conftest.py`|
|React project setup|`frontend-react/` (Vite + Tailwind + shadcn)|
|Theme provider + toggle|`App.tsx` + `Header.tsx`|
|React Query hooks pattern|`hooks/use-vehicles.ts`|
|CSV export utility|`lib/csv.ts`|
|Service Worker|`public/sw.js`|
|Docker setup|`Dockerfile` + `docker-compose.yml`|

---

## What's Different from VroomVroom


| Aspect        | VroomVroom                        | This App                                   |
| ------------- | --------------------------------- | ------------------------------------------ |
| Data model    | Fixed schema                      | Flexible schema (categories define fields) |
| Forms         | Static per entity                 | Dynamic from `custom_fields` JSON          |
| Navigation    | Single dashboard                  | Sidebar with category navigation           |
| Images        | None                              | Item photos — v2                           |
| Key challenge | Calculations (consumption, stats) | Dynamic field rendering + JSON validation  |
## Category Specifications

### Items Table — Extra ENUM Columns

These fields go directly on the `items` table (not in `custom_data`) because they are filtered/sorted frequently:

|Column|Categories|Values|
|---|---|---|
|`reading_status`|manga, books|`completed`, `reading`, `owned_unread`, `plan_to_read`|
|`wear_status`|vêtements|`active`, `stored`, `to_sell`, `to_donate`|
|`deployment_status`|tech|`in_use_pc`, `in_use_server`, `in_use_other`, `storage`, `to_sell`, `broken`|

All three are **nullable** — only relevant for their category, ignored by everything else.

### Phase 3 Features per Category

| Feature                   | Category     | Notes                                                |
| ------------------------- | ------------ | ---------------------------------------------------- |
| ISBN / barcode scanner    | manga, books | ZXing + Open Library API                             |
| Volume completion tracker | manga        | Separate `manga_series` table, shows missing volumes |
| Cost per wear calculator  | vêtements    | `purchase_price / times_worn`, calculated not stored |
| PC/Server build view      | tech         | Group items by `assigned_to` to see full build       |
