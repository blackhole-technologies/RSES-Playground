import { useState } from "react";
import { useConfigs, useCreateConfig, useDeleteConfig } from "@/hooks/use-configs";
import { Plus, Search, FileCode, Trash2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Config } from "@shared/schema";

interface ConfigSidebarProps {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onNew: () => void;
}

export function ConfigSidebar({ selectedId, onSelect, onNew }: ConfigSidebarProps) {
  const { data: configs = [], isLoading } = useConfigs();
  const [search, setSearch] = useState("");
  const deleteMutation = useDeleteConfig();
  const createMutation = useCreateConfig();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newConfigName, setNewConfigName] = useState("");

  const filteredConfigs = configs.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    try {
      if (!newConfigName.trim()) return;
      
      const newConfig = await createMutation.mutateAsync({
        name: newConfigName,
        content: "# New configuration\n",
        description: "Created via sidebar"
      });
      
      setIsCreateOpen(false);
      setNewConfigName("");
      onSelect(newConfig.id);
      
      toast({
        title: "Configuration created",
        description: `Successfully created "${newConfig.name}"`,
      });
    } catch (error) {
      toast({
        title: "Error creating configuration",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await deleteMutation.mutateAsync(id);
      if (selectedId === id) onSelect(null);
      toast({ title: "Configuration deleted" });
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to delete" });
    }
  };

  return (
    <div className="flex flex-col h-full bg-card border-r border-border w-64 md:w-72 flex-shrink-0">
      <div className="p-4 border-b border-border space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">Configurations</h2>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-8 w-8 hover:bg-primary/20 hover:text-primary"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search..." 
            className="pl-8 bg-background/50 border-input h-9 text-sm focus-visible:ring-primary/50" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          <button
            onClick={onNew}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-all duration-200 group",
              selectedId === null 
                ? "bg-primary text-primary-foreground font-medium shadow-md shadow-primary/20" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <div className={cn(
              "p-1.5 rounded-md", 
              selectedId === null ? "bg-primary-foreground/20" : "bg-muted-foreground/10 group-hover:bg-muted-foreground/20"
            )}>
              <Plus className="h-4 w-4" />
            </div>
            <span>New Draft</span>
          </button>
          
          <div className="my-2 border-t border-border/50 mx-2" />

          {isLoading ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">Loading configs...</div>
          ) : filteredConfigs.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">No saved configs found</div>
          ) : (
            filteredConfigs.map((config) => (
              <div 
                key={config.id}
                onClick={() => onSelect(config.id)}
                className={cn(
                  "relative group flex items-center justify-between px-3 py-2 text-sm rounded-md cursor-pointer transition-all duration-200 border border-transparent",
                  selectedId === config.id
                    ? "bg-secondary text-secondary-foreground border-border shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground hover:border-border/50"
                )}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <FileCode className={cn(
                    "h-4 w-4 flex-shrink-0",
                    selectedId === config.id ? "text-primary" : "text-muted-foreground"
                  )} />
                  <span className="truncate">{config.name}</span>
                </div>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity -mr-1"
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    <DropdownMenuItem 
                      className="text-destructive focus:text-destructive cursor-pointer"
                      onClick={(e) => handleDelete(e, config.id)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Configuration</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="e.g., 'Production Routing Rules'"
              value={newConfigName}
              onChange={(e) => setNewConfigName(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newConfigName.trim() || createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
