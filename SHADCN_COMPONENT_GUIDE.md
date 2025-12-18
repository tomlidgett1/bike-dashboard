# 🎨 shadcn/ui Component Guide

## ⚠️ CRITICAL RULE

**ALWAYS use shadcn/ui components for ALL UI elements.**

❌ **NEVER** use plain HTML elements like `<button>`, `<input>`, `<select>`, etc.  
✅ **ALWAYS** use shadcn components from `@/components/ui/`

---

## 📋 Component Reference

### Installed Components

✅ Already in your project:
- `Button` - Buttons with variants
- `Input` - Text inputs
- `Label` - Form labels
- `Switch` - Toggle switches
- `Card`, `CardHeader`, `CardContent`, `CardDescription`, `CardTitle` - Card layouts
- `Badge` - Status badges
- `Avatar` - User avatars
- `Separator` - Dividing lines
- `Sheet` - Side panels
- `ScrollArea` - Scrollable areas
- `DropdownMenu` - Dropdown menus
- `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue` - Select dropdowns

---

## 🔧 How to Add New Components

### Step 1: Check Available Components
```bash
npx shadcn@latest add --help
```

### Step 2: Install Component
```bash
npx shadcn@latest add component-name
```

Examples:
```bash
npx shadcn@latest add select
npx shadcn@latest add checkbox
npx shadcn@latest add dialog
npx shadcn@latest add tabs
npx shadcn@latest add form
npx shadcn@latest add textarea
npx shadcn@latest add radio-group
```

### Step 3: Import and Use
```tsx
import { ComponentName } from "@/components/ui/component-name"
```

---

## 📚 Common Component Examples

### ✅ Button
```tsx
import { Button } from "@/components/ui/button"

// Primary button
<Button>Click Me</Button>

// Secondary button
<Button variant="secondary">Cancel</Button>

// Destructive button
<Button variant="destructive">Delete</Button>

// Outline button
<Button variant="outline">Outline</Button>

// With icon
<Button>
  <Save className="mr-2 h-4 w-4" />
  Save Changes
</Button>
```

### ✅ Input
```tsx
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

<div className="space-y-2">
  <Label htmlFor="email">Email</Label>
  <Input 
    id="email"
    type="email"
    placeholder="you@example.com"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    className="rounded-md"
  />
</div>
```

### ✅ Select (Dropdown)
```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

<Select value={value} onValueChange={setValue}>
  <SelectTrigger className="rounded-md">
    <SelectValue placeholder="Select an option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
    <SelectItem value="option3">Option 3</SelectItem>
  </SelectContent>
</Select>
```

### ✅ Switch (Toggle)
```tsx
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

<div className="flex items-center space-x-2">
  <Switch
    id="notifications"
    checked={enabled}
    onCheckedChange={setEnabled}
  />
  <Label htmlFor="notifications">Enable notifications</Label>
</div>
```

### ✅ Checkbox
```tsx
// First install: npx shadcn@latest add checkbox
import { Checkbox } from "@/components/ui/checkbox"

<div className="flex items-center space-x-2">
  <Checkbox
    id="terms"
    checked={accepted}
    onCheckedChange={setAccepted}
  />
  <label htmlFor="terms">Accept terms and conditions</label>
</div>
```

### ✅ Radio Group
```tsx
// First install: npx shadcn@latest add radio-group
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"

<RadioGroup value={value} onValueChange={setValue}>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="option1" id="option1" />
    <Label htmlFor="option1">Option 1</Label>
  </div>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="option2" id="option2" />
    <Label htmlFor="option2">Option 2</Label>
  </div>
</RadioGroup>
```

### ✅ Textarea
```tsx
// First install: npx shadcn@latest add textarea
import { Textarea } from "@/components/ui/textarea"

<Textarea
  placeholder="Enter description..."
  value={description}
  onChange={(e) => setDescription(e.target.value)}
  className="rounded-md"
/>
```

### ✅ Dialog (Modal)
```tsx
// First install: npx shadcn@latest add dialog
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

<Dialog>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Are you sure?</DialogTitle>
      <DialogDescription>
        This action cannot be undone.
      </DialogDescription>
    </DialogHeader>
    {/* Dialog content */}
  </DialogContent>
</Dialog>
```

### ✅ Tabs
```tsx
// First install: npx shadcn@latest add tabs
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

<Tabs defaultValue="tab1">
  <TabsList>
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">
    Content for tab 1
  </TabsContent>
  <TabsContent value="tab2">
    Content for tab 2
  </TabsContent>
</Tabs>
```

### ✅ Card
```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

<Card className="rounded-md">
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description</CardDescription>
  </CardHeader>
  <CardContent>
    Card content goes here
  </CardContent>
</Card>
```

---

## 🚫 What NOT to Do

### ❌ Plain HTML Button
```tsx
// WRONG
<button onClick={handleClick}>Click Me</button>
```

### ✅ Correct Way
```tsx
// CORRECT
import { Button } from "@/components/ui/button"
<Button onClick={handleClick}>Click Me</Button>
```

---

### ❌ Plain HTML Select
```tsx
// WRONG
<select value={value} onChange={(e) => setValue(e.target.value)}>
  <option value="1">Option 1</option>
</select>
```

### ✅ Correct Way
```tsx
// CORRECT
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

<Select value={value} onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue placeholder="Select..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="1">Option 1</SelectItem>
  </SelectContent>
</Select>
```

---

### ❌ Plain HTML Checkbox
```tsx
// WRONG
<input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
```

### ✅ Correct Way
```tsx
// CORRECT (install first: npx shadcn@latest add checkbox)
import { Checkbox } from "@/components/ui/checkbox"
<Checkbox checked={checked} onCheckedChange={setChecked} />
```

---

## 🎯 Quick Install Commands

```bash
# Form components
npx shadcn@latest add checkbox
npx shadcn@latest add radio-group
npx shadcn@latest add textarea
npx shadcn@latest add select
npx shadcn@latest add form

# Layout components
npx shadcn@latest add dialog
npx shadcn@latest add tabs
npx shadcn@latest add accordion
npx shadcn@latest add popover
npx shadcn@latest add tooltip

# Data display
npx shadcn@latest add table
npx shadcn@latest add alert
npx shadcn@latest add toast

# Navigation
npx shadcn@latest add navigation-menu
npx shadcn@latest add command
npx shadcn@latest add menubar
```

---

## 📖 Full Documentation

For complete documentation, visit:
- [shadcn/ui Documentation](https://ui.shadcn.com)
- [shadcn/ui Components](https://ui.shadcn.com/docs/components)

---

## ✅ Checklist Before Adding UI

- [ ] Check if component exists in `src/components/ui/`
- [ ] If not, install with `npx shadcn@latest add component-name`
- [ ] Import the shadcn component
- [ ] Use `rounded-md` for border radius (per project rules)
- [ ] Follow project design patterns (white bg, etc.)
- [ ] Never use plain HTML form elements

---

## 🎨 Project-Specific Styling Rules

When using shadcn components, always apply these project rules:

1. **Border Radius**: Use `rounded-md` on all containers
2. **Backgrounds**: Use white backgrounds for containers (`bg-white`)
3. **Icons**: Use lucide-react icons with appropriate sizing
4. **Spacing**: Consistent padding and margins
5. **Dark Mode**: Components support dark mode automatically

Example:
```tsx
<Select>
  <SelectTrigger className="rounded-md"> {/* Project rule */}
    <SelectValue placeholder="Select..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="1">Option 1</SelectItem>
  </SelectContent>
</Select>
```

---

**Remember: shadcn/ui first, always. Never use plain HTML for interactive elements!** 🎨















