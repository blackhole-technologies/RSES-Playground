/**
 * RSES CMS Theme Settings UI
 *
 * Admin interface for configuring theme settings.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useTheme, useThemeSettings, useColorScheme } from '../context/ThemeContext';
import type {
  ThemeSettingsGroup,
  ThemeSetting,
  SettingType,
} from '../types';
import { cn } from '@/lib/utils';

// Import UI components (these would come from your component library)
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Separator } from '@/components/ui/separator';
import {
  Settings,
  Palette,
  Type,
  Layout,
  Sparkles,
  Zap,
  Sun,
  Moon,
  Monitor,
  RotateCcw,
} from 'lucide-react';

// ============================================================================
// ICON MAPPING
// ============================================================================

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Settings,
  Palette,
  Type,
  Layout,
  Sparkles,
  Zap,
};

// ============================================================================
// SETTING INPUT COMPONENTS
// ============================================================================

interface SettingInputProps {
  setting: ThemeSetting;
  value: unknown;
  onChange: (value: unknown) => void;
}

function TextSettingInput({ setting, value, onChange }: SettingInputProps) {
  return (
    <Input
      type="text"
      value={String(value ?? setting.default ?? '')}
      onChange={(e) => onChange(e.target.value)}
      placeholder={setting.options?.placeholder}
    />
  );
}

function NumberSettingInput({ setting, value, onChange }: SettingInputProps) {
  const numValue = Number(value ?? setting.default ?? 0);
  const { min = 0, max = 100, step = 1, unit = '' } = setting.options ?? {};

  return (
    <div className="flex items-center gap-4">
      <Slider
        value={[numValue]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
        className="flex-1"
      />
      <div className="w-16 text-right text-sm text-muted-foreground">
        {numValue}{unit}
      </div>
    </div>
  );
}

function BooleanSettingInput({ setting, value, onChange }: SettingInputProps) {
  const boolValue = Boolean(value ?? setting.default ?? false);

  return (
    <Switch
      checked={boolValue}
      onCheckedChange={onChange}
    />
  );
}

function ColorSettingInput({ setting, value, onChange }: SettingInputProps) {
  const colorValue = String(value ?? setting.default ?? '#000000');

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={colorValue}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent p-1"
      />
      <Input
        type="text"
        value={colorValue}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 font-mono text-sm"
        pattern="^#[0-9A-Fa-f]{6}$"
      />
    </div>
  );
}

function SelectSettingInput({ setting, value, onChange }: SettingInputProps) {
  const selectValue = String(value ?? setting.default ?? '');
  const choices = setting.options?.choices ?? [];

  return (
    <Select value={selectValue} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {choices.map((choice) => (
          <SelectItem key={choice.value} value={choice.value}>
            {choice.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FontSettingInput({ setting, value, onChange }: SettingInputProps) {
  const fontValue = String(value ?? setting.default ?? '');
  const fontOptions = setting.options?.fontOptions ?? [];

  return (
    <Select value={fontValue} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {fontOptions.map((font) => (
          <SelectItem
            key={font.family}
            value={font.family}
            style={{ fontFamily: font.family }}
          >
            {font.family}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SettingInput(props: SettingInputProps) {
  const { setting } = props;

  switch (setting.type) {
    case 'text':
    case 'textarea':
      return <TextSettingInput {...props} />;
    case 'number':
    case 'spacing':
      return <NumberSettingInput {...props} />;
    case 'boolean':
      return <BooleanSettingInput {...props} />;
    case 'color':
      return <ColorSettingInput {...props} />;
    case 'select':
      return <SelectSettingInput {...props} />;
    case 'font':
      return <FontSettingInput {...props} />;
    default:
      return <TextSettingInput {...props} />;
  }
}

// ============================================================================
// SETTING ITEM COMPONENT
// ============================================================================

interface SettingItemProps {
  setting: ThemeSetting;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  allSettings: Record<string, unknown>;
}

function SettingItem({ setting, value, onChange, allSettings }: SettingItemProps) {
  // Check visibility condition
  if (setting.visibleWhen) {
    const { setting: condSetting, operator, value: condValue } = setting.visibleWhen;
    const actualValue = allSettings[condSetting];

    let isVisible = false;
    switch (operator) {
      case 'eq':
        isVisible = actualValue === condValue;
        break;
      case 'neq':
        isVisible = actualValue !== condValue;
        break;
      case 'in':
        isVisible = Array.isArray(condValue) && condValue.includes(actualValue);
        break;
      case 'nin':
        isVisible = Array.isArray(condValue) && !condValue.includes(actualValue);
        break;
      default:
        isVisible = true;
    }

    if (!isVisible) return null;
  }

  const isBoolean = setting.type === 'boolean';

  return (
    <div className={cn('space-y-2', isBoolean && 'flex items-center justify-between')}>
      <div className={cn(!isBoolean && 'space-y-1')}>
        <Label htmlFor={setting.key} className="text-sm font-medium">
          {setting.label}
        </Label>
        {setting.description && (
          <p className="text-xs text-muted-foreground">{setting.description}</p>
        )}
      </div>
      <SettingInput
        setting={setting}
        value={value}
        onChange={(v) => onChange(setting.key, v)}
      />
    </div>
  );
}

// ============================================================================
// SETTINGS GROUP COMPONENT
// ============================================================================

interface SettingsGroupProps {
  group: ThemeSettingsGroup;
  settings: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

function SettingsGroup({ group, settings, onChange }: SettingsGroupProps) {
  const Icon = group.icon ? iconMap[group.icon] : Settings;

  return (
    <AccordionItem value={group.id}>
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          <span>{group.label}</span>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pt-2">
          {group.description && (
            <p className="text-sm text-muted-foreground">{group.description}</p>
          )}
          {group.settings.map((setting) => (
            <SettingItem
              key={setting.key}
              setting={setting}
              value={settings[setting.key]}
              onChange={onChange}
              allSettings={settings}
            />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

// ============================================================================
// COLOR SCHEME SELECTOR
// ============================================================================

function ColorSchemeSelector() {
  const { colorScheme, setColorScheme } = useColorScheme();

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Color Scheme</Label>
      <div className="flex gap-2">
        <Button
          variant={colorScheme === 'light' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setColorScheme('light')}
          className="flex-1"
        >
          <Sun className="mr-2 h-4 w-4" />
          Light
        </Button>
        <Button
          variant={colorScheme === 'dark' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setColorScheme('dark')}
          className="flex-1"
        >
          <Moon className="mr-2 h-4 w-4" />
          Dark
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setColorScheme('system')}
          className="flex-1"
        >
          <Monitor className="mr-2 h-4 w-4" />
          System
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// THEME SELECTOR
// ============================================================================

function ThemeSelector() {
  const { theme, setTheme, registry, isLoading } = useTheme();

  const themes = useMemo(() => registry.list(), [registry]);
  const currentTheme = theme?.manifest.name ?? 'base';

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Theme</Label>
      <Select value={currentTheme} onValueChange={setTheme} disabled={isLoading}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {themes.map((t) => (
            <SelectItem key={t.name} value={t.name}>
              <div className="flex flex-col">
                <span>{t.displayName}</span>
                <span className="text-xs text-muted-foreground">{t.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ============================================================================
// MAIN THEME SETTINGS COMPONENT
// ============================================================================

interface ThemeSettingsProps {
  className?: string;
  showThemeSelector?: boolean;
  showColorScheme?: boolean;
  onClose?: () => void;
}

export function ThemeSettings({
  className,
  showThemeSelector = true,
  showColorScheme = true,
  onClose,
}: ThemeSettingsProps) {
  const { theme, updateSettings } = useTheme();
  const { settings } = useThemeSettings();

  const [localSettings, setLocalSettings] = useState(settings);
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = useCallback((key: string, value: unknown) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(() => {
    updateSettings(localSettings);
    setHasChanges(false);
  }, [localSettings, updateSettings]);

  const handleReset = useCallback(() => {
    if (theme) {
      setLocalSettings(theme.manifest.settings.defaults);
      setHasChanges(true);
    }
  }, [theme]);

  if (!theme) {
    return (
      <div className={cn('p-4 text-center text-muted-foreground', className)}>
        No theme loaded
      </div>
    );
  }

  const settingsGroups = theme.manifest.settings.groups;

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h2 className="text-lg font-semibold">Theme Settings</h2>
          <p className="text-sm text-muted-foreground">
            Customize {theme.manifest.displayName}
          </p>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          {/* Theme & Color Scheme */}
          {(showThemeSelector || showColorScheme) && (
            <div className="space-y-4">
              {showThemeSelector && <ThemeSelector />}
              {showColorScheme && theme.manifest.features.colorModes && (
                <ColorSchemeSelector />
              )}
              <Separator />
            </div>
          )}

          {/* Settings Groups */}
          <Accordion
            type="multiple"
            defaultValue={settingsGroups.filter((g) => !g.collapsed).map((g) => g.id)}
          >
            {settingsGroups.map((group) => (
              <SettingsGroup
                key={group.id}
                group={group}
                settings={localSettings}
                onChange={handleChange}
              />
            ))}
          </Accordion>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t p-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={!hasChanges}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset to Defaults
        </Button>
        <div className="flex gap-2">
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={!hasChanges}>
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// THEME SETTINGS PANEL (DRAWER/SHEET)
// ============================================================================

interface ThemeSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ThemeSettingsPanel({ open, onOpenChange }: ThemeSettingsPanelProps) {
  // This would use a Sheet/Drawer component
  // Simplified implementation:
  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-96 border-l bg-background shadow-xl">
      <ThemeSettings onClose={() => onOpenChange(false)} />
    </div>
  );
}

// ============================================================================
// QUICK THEME TOGGLE
// ============================================================================

export function QuickThemeToggle({ className }: { className?: string }) {
  const { colorScheme, toggleColorScheme, hasFeature } = useTheme();

  if (!hasFeature('colorModes')) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleColorScheme}
      className={className}
      aria-label={`Switch to ${colorScheme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {colorScheme === 'dark' ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
