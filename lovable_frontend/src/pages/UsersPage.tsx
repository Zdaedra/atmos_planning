import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSupervisors } from "@/lib/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function SupervisorCard({ user }: { user: any }) {
  const [showPw, setShowPw] = useState(false);
  const initials = user.name.split(" ").map((n) => n[0]).join("");

  return (
    <div className="card-atmos card-hover flex flex-col items-center text-center">
      <Avatar className="w-16 h-16 mb-3">
        <AvatarFallback className="bg-muted text-lg font-medium text-muted-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>
      <h3 className="text-sm font-semibold text-foreground">{user.name}</h3>
      <p className="text-xs text-muted-foreground mb-2">{user.email}</p>
      <Badge className="bg-primary/10 text-primary mb-3" variant="secondary">
        {user.role}
      </Badge>
      <div className="flex items-center gap-2 w-full bg-muted rounded-lg px-3 py-2">
        <span className="text-xs text-muted-foreground flex-1 text-left font-mono">
          {showPw ? user.password : "••••••••"}
        </span>
        <button onClick={() => setShowPw(!showPw)} className="text-muted-foreground hover:text-foreground transition-colors">
          {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function AddSupervisorCard() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="rounded-[20px] border-2 border-dashed border-border p-6 flex flex-col items-center justify-center gap-3 hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer min-h-[240px]">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Plus className="w-6 h-6 text-muted-foreground" />
          </div>
          <span className="text-sm font-medium text-muted-foreground">Add Supervisor</span>
        </button>
      </DialogTrigger>
      <DialogContent className="animate-modal-in">
        <DialogHeader>
          <DialogTitle>Add Supervisor</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Full Name</Label>
            <Input placeholder="Enter full name" className="mt-1" />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" placeholder="email@example.com" className="mt-1" />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" placeholder="Password" className="mt-1" />
          </div>
          <div>
            <Label>Confirm Password</Label>
            <Input type="password" placeholder="Confirm password" className="mt-1" />
          </div>
          <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
            Add Supervisor
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const { data: supervisors = [], isLoading } = useQuery({
    queryKey: ['supervisors'],
    queryFn: fetchSupervisors
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Users</h1>
      <div className="grid grid-cols-4 gap-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        <AddSupervisorCard />
        {!isLoading && supervisors.map((s: any) => (
          <SupervisorCard key={s.id} user={s} />
        ))}
      </div>
    </div>
  );
}
