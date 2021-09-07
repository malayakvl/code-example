<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\CrudController;
use App\Http\Requests\School\PlaceEventRequest;
use App\Http\Requests\School\PlaceRepeatEventRequest;
use App\Http\Requests\School\PlaceSingleEventRequest;
use App\Http\Requests\School\UpdateEventRequest;
use App\Models\Department;
use App\Models\Group;
use App\Models\Lesson;
use App\Models\ScheduledEvent;
use App\Models\School;
use App\Models\Student;
use App\Models\SubGroup;
use App\Observers\ScheduledEventObserver;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SchoolController extends CrudController
{

    public function index()
    {
        $query = School::query();
        if (auth()->user()->can('super-admin')) {
            return $query->orderBy('name')->get();
        }

        if (auth()->user()->can('super-admin-in-department') || auth()->user()->can('change-school')) {
            $departments = auth()->user()->departments;
            $schoolIds = $departments
                ->map(function (Department $department) {
                    return $department->schools()->pluck('id');
                })
                ->flatten()
                ->unique()
                ->toArray();

            $query = $query->whereIn('id', $schoolIds);
            return $query->orderBy('name')->get();
        }
        return [];
    }

    public function groups(School $school)
    {
        $year = request()->query->getInt('year', 0);
        $studyProgramId = request()->query->getInt('study_program_id', 0);
        $studyProgram = \App\Models\StudyProgram::find($studyProgramId);

        $groups = [];

        $exactly = $school->groups()
            ->where('study_program_id', $studyProgramId)
            ->where('started_at_year', $year)
            ->get()
            ->map(function (Group $group) {
                return $this->mapGroupNameWithCount($group);
            });

        $exactlyIds = $exactly->pluck('id');

        $similarStudyPrograms = $school->studyPrograms()
            ->where('years', $studyProgram->years)
            ->pluck('id');

        $similarGroups = $school->groups()
            ->whereNotIn('groups.id', $exactlyIds)
            ->active()
            ->get()
            ->map(function (Group $group) {
                return $this->mapGroupNameWithCount($group);
            });

        array_push($groups, [
            'name' => __('app.group.extra.select_group_title', [
                'study_program_name' => $studyProgram->name,
                'start_year' => $year
            ]),
            'groups' => $exactly
        ]);

        array_push($groups, [
            'name' => __('app.group.extra.select_group_similar'),
            'groups' => $similarGroups
        ]);

        return [
            'data' => $groups,
            'grouping' => [
                'groups' => true,
                'name' => 'name',
                'value' => 'groups'
            ]
        ];
    }

    public function assignGroup(School $school)
    {
        $studentId = (int)request()->get('studentId');
        $groupId = (int)request()->get('groupId');
        $subjectId = (int)request()->get('subjectId');
        $studyProgramId = (int)request()->get('studyProgramId');

        /** @var Student $student */
        $student = Student::find($studentId);
        $student->groups()->attach($groupId, [
            'subject_id' => $subjectId,
            'study_program_id' => $studyProgramId,
            'school_id' => $student->school_id
        ]);

        return [$studentId, $groupId, $subjectId, $studyProgramId];
    }

    public function oneTimeEvents(School $school, Request $request)
    {
        return $school->subGroups()->select("sub_groups.*")
            ->orderBy('sub_groups.school_id')
            ->orderBy('sub_groups.name', 'asc')
            ->where('sub_groups.school_id', $school->id)
            ->where(function ($query) {
                $query->where('type', 'one-time')
                    ->where('is_expired', false);
            })->get()
            ->map(function (SubGroup $event) {
                return view('partials.lesson-ribbon-event', compact('event'))->render();
            });
    }


    public function updateLessons(School $school, Request $request)
    {
        $selectedDate = explode('-', $request->get('date'));
        Carbon::setWeekStartsAt(Carbon::MONDAY);
        $carbonCurrentDate = Carbon::create($selectedDate[0], $selectedDate[1], $selectedDate[2]);

//        $weekStartDate = $carbonCurrentDate->startOfWeek();
        $weekEndDate = $carbonCurrentDate->endOfWeek();
        $weekStartDate = $weekEndDate->subDay(6);
        $ignoreLessons = $request->query->get('ignore', []);
        $take = $request->query->getInt('take');
        $skip = $request->query->getInt('skip');
        $lessons = $school->lessons()
            ->select('lessons.*')
            ->whereNotIn('lessons.id', $ignoreLessons)
//            ->notFulfilled()
            ->joinGroup()
            ->joinSubgroup()
            ->joinStudent()
            ->joinTeacher()
            ->joinSubject()
            ->take(15)
            ->skip($skip)
            ->orderBy('lessons.created_at')
            ->get();
        $html = '';
        foreach ($lessons as $lesson) {
            $totalweekDuration = \App\Models\ScheduledEvent::where('lesson_id', $lesson->id)
                ->whereBetween('fire_until', array($weekStartDate->format('Y-m-d'), $weekEndDate->format('Y-m-d')))
                ->sum('duration');
            $lesson->duration_left = $lesson->duration * 100 - $totalweekDuration;
            $html .= view('partials.lesson-ribbon-item', compact('lesson'))->render();
        }

        return $html;
    }

    public function lessons(School $school, Request $request)
    {
        $ignoreLessons = $request->query->get('ignore', []);
        $take = $request->query->getInt('take');
        $skip = $request->query->getInt('skip');
        $selectedDate = explode('-', $request->get('date'));
//        $selectedDate = explode('-', '2021-08-16');
        Carbon::setWeekStartsAt(Carbon::MONDAY);
        $carbonCurrentDate = Carbon::create($selectedDate[0], $selectedDate[1], $selectedDate[2]);

        $weekStartDate = $carbonCurrentDate->clone()->startOfWeek();
        $weekEndDate = $carbonCurrentDate->clone()->endOfWeek();

        return $school->lessons()
            ->select('lessons.*')
            ->whereNotIn('lessons.id', $ignoreLessons)
            ->notFulfilled()
            ->joinGroup()
            ->joinSubgroup()
            ->joinStudent()
            ->joinTeacher()
            ->joinSubject()
            ->take(20)
            ->skip($skip)
            ->orderBy('lessons.created_at')
            ->get()
            ->map(function (Lesson $lesson) use ($weekStartDate, $weekEndDate) {
                // get total duration for current lesson
                $totalweekDuration = \App\Models\ScheduledEvent::where('lesson_id', $lesson->id)
                    ->whereBetween('fire_until', array($weekStartDate->format('Y-m-d'), $weekEndDate->format('Y-m-d')))
                    ->sum('duration');
                $lesson->duration_left = ($lesson->duration * 100 - $totalweekDuration) / 100;
                return view('partials.lesson-ribbon-item', compact('lesson'))->render();
            });
    }

    public function schedule(School $school, Request $request)
    {
        $day = $request->query->get('date', today()->format('Y-m-d'));
        $day = Carbon::parse($day);
        $dayOfWeek = $day->dayOfWeek;
        $dayOfWeek--;
        if ($dayOfWeek < 0) {
            $dayOfWeek = 6;
        }

        $events = $school->scheduledEvents()
            ->atDay($day)
            ->withTime()
            ->joinLesson()
            ->get();

        $schoolSchedule = $school->schedule;
        $events = $events
            ->groupBy(function (ScheduledEvent $event) {
                return $event->audience_id;
            })
            ->map(function ($items) use ($schoolSchedule, $dayOfWeek) {
                $hourOffset = (int)$schoolSchedule[$dayOfWeek]['from'];

                return $items
                    ->groupBy(function (ScheduledEvent $event) use ($hourOffset) {
                        return $event->fire_at->hour - $hourOffset;
                    })
                    ->map(function ($items) use ($hourOffset) {
                        return $items
                            ->groupBy(function (ScheduledEvent $event) {
                                return $event->fire_at->minute;
                            })
                            ->map(function ($items) use ($hourOffset) {
                                return $items->map(function (ScheduledEvent $event) use ($hourOffset) {
                                    $event->hour -= $hourOffset;
                                    $event->instrumentId = $event->lesson->instrument_id;
//                                    $event->instrumentId = null;
                                    return $event;
                                });
                            });
                    });
            });

        return [$dayOfWeek => $events];
    }

    public function placeSingleEvent(School $school, PlaceSingleEventRequest $request)
    {
        $validated = $request->validated();
        $lessonId = (int)$validated['lessonId'];
        $audienceId = (int)$validated['audienceId'];
        $_event = $school->subGroups()->where('id', $lessonId)->firstOrFail();

        $fireAt = Carbon::parse($validated['fireAt']);
        $fireUntil = Carbon::parse($validated['fireAt']);
        $minutes = (int)$validated['minute'];
        $hour = (int)$validated['hour'];
        $duration = $validated['duration'];
        $dayOfWeek = (int)$validated['dayOfWeek'] ?? 0;
        $schoolSchedule = $school->schedule;
        $from = (int)$schoolSchedule[$dayOfWeek]['from'];
        $hour += $from;
        $offset = $validated['offset'];
        $fireAt = $fireAt->setHours($hour)->setMinutes($minutes);

        // create new lesson for event
        $lesson = Lesson::where([
            'sub_group_id' => $lessonId,
            'school_id' => $school->id
        ])->first();
        if (!$lesson) {
            $lesson = new Lesson();
            $lesson->sub_group_id = $lessonId;
            $lesson->school_id = $school->id;
        }
        $lesson->duration = $duration;
        $lesson->duration_left = 0;
        $lesson->is_group = 1;
        $lesson->save();

        $event = $lesson->schedule($fireAt, $fireAt, $duration, [
            'audience_id' => $audienceId,
            'onetime' => 1,
            'title' => $validated['title'],
            'type' => ScheduledEvent::TYPE_NORMAL,
            'event_type' => 'one-time',
            'lesson_id' => $lesson->id,
            'offset' => $offset
        ]);

        $event->validateFreeTime();

        $event->save();

        $_event->is_expired = true;
        $_event->save();

        $event->lesson_duration_left = number_format($event->lesson->duration_left / 45, 2);
        $event->duration_left = $event->lesson->duration_left;

        return $event;
    }

    public function repeatedEvents(School $school, Request $request)
    {
        $today = $request->get('date') ? $request->get('date') : date('Y-m-d');
        $now = Carbon::parse($today);

        $selectedDate = explode('-', $request->get('date'));
        Carbon::setWeekStartsAt(Carbon::MONDAY);
        $carbonCurrentDate = Carbon::create($selectedDate[0], $selectedDate[1], $selectedDate[2]);

        $weekStartDate = $carbonCurrentDate->clone()->startOfWeek();
        $weekEndDate = $carbonCurrentDate->clone()->endOfWeek();

        $periodBetween = [$now->startOfWeek()->format('Y-m-d'), $now->endOfWeek()->format('Y-m-d')];
        return $school->subGroups()->select("sub_groups.*")
            ->orderBy('sub_groups.school_id')
            ->orderBy('sub_groups.name', 'asc')
            ->where('sub_groups.school_id', $school->id)
            ->where('type', 'repeat')
            ->whereDate('start_date', '<=', $today)
            ->whereDate('end_date', '>=', $today)
            ->get()
            ->map(function (SubGroup $event, $totalDuration) use ($weekStartDate, $weekEndDate) {
                $totalweekDuration = \App\Models\ScheduledEvent::where('event_type_id', $event->id)
                    ->where('event_type', 'repeat')
                    ->whereBetween('fire_until', array($weekStartDate->format('Y-m-d'), $weekEndDate->format('Y-m-d')))
                    ->sum('duration');
                $event->duration_left = ($event->hours * 45 * 100 - $totalweekDuration) / 100;

                return view('partials.lesson-ribbon-event-repeat', compact('event'))->render();
            });
    }


    public function placeRepeatEvent(School $school, PlaceRepeatEventRequest $request)
    {
        $validated = $request->validated();

        $lessonId = (int)$validated['lessonId'];
        $audienceId = (int)$validated['audienceId'];
        $_event = $school->subGroups()->where('id', $lessonId)->firstOrFail();

        $fireAt = Carbon::parse($validated['fireAt']);
        $minutes = (int)$validated['minute'];
        $hour = (int)$validated['hour'];
        $duration = $validated['duration'];
        $dayOfWeek = (int)$validated['dayOfWeek'] ?? 0;
        $schoolSchedule = $school->schedule;
        $from = (int)$schoolSchedule[$dayOfWeek]['from'];
        $hour += $from;
        $offset = $validated['offset'];
        $fireAt = $fireAt->setHours($hour)->setMinutes($minutes);
        if($fireAt->lt($_event->start_date)){
            throw ValidationException::withMessages(['Не можливо створити подію раніше її початку']);
        }
        $endDate = Carbon::parse($_event->end_date);
        //$dateRange = CarbonPeriod::create($fireAt, $endDate);

        // create new lesson for event
        $lesson = Lesson::where([
            'sub_group_id' => $lessonId,
            'school_id' => $school->id
        ])->first();
        if (!$lesson) {
            $lesson = new Lesson();
            $lesson->sub_group_id = $lessonId;
            $lesson->school_id = $school->id;
        }
        $lesson->duration = $duration;
        $lesson->duration_left = 0;
        $lesson->is_group = 1;
        $lesson->save();

        $groupId = md5(microtime());
        $event = $lesson->schedule($fireAt, $fireAt, $duration, [
            'audience_id' => $audienceId,
            'onetime' => 1,
            'title' => $validated['title'],
            'type' => ScheduledEvent::TYPE_NORMAL,
            'event_type' => 'repeat',
            'lesson_id' => $lesson->id,
            'group_id' => $groupId,
            'offset' => $offset,
            'event_type_id' => $_event->id
        ]);

        $event->validateFreeTime($endDate);

        $event->save();

        $startDate = $fireAt->clone()->addDays(7);
        $dateRange = CarbonPeriod::since($startDate)->days(7)->until($endDate);

        foreach ($dateRange as $date) {
            $newEvent = $event->replicate();
            $newEvent->fire_at = $newEvent->fire_until = $date;
            $newEvent->save();
        }

        $event->lesson_duration_left = number_format($event->lesson->duration_left / 45, 2);
        $event->duration_left = $event->lesson->duration_left;
        return $event;
    }


    public function placeEvent(School $school, PlaceEventRequest $request)
    {
        $validated = $request->validated();
        $lessonId = (int)$validated['lessonId'];
        $audienceId = (int)$validated['audienceId'];
        $teacherId = (int)$validated['teacherId'];

        $fireAt = Carbon::parse($validated['fireAt']);
        $fireUntil = Carbon::parse($validated['fireAt']);
        $onetime = $validated['onetime'];
        $minutes = (int)$validated['minute'];
        $hour = (int)$validated['hour'];
        $duration = $validated['duration'];
        $dayOfWeek = (int)$validated['dayOfWeek'] ?? 0;
        $schoolSchedule = $school->schedule;
        $from = (int)$schoolSchedule[$dayOfWeek]['from'];
        $hour += $from;
        $offset = (int)$validated['offset'];
        //$day = now()->setMinute($minutes)->setHour($hour);
        $fireAt = $fireAt->setHours($hour)->setMinutes($minutes);
//        $fireUntil = $fireUntil->setHours($hour)->setMinutes($minutes)->addYears(1);

        /** @var Lesson $lesson */
        $lesson = Lesson::findOrFail($lessonId);
        /** @var ScheduledEvent $event */

        //TODO: and there

        $groupId = md5(microtime());
        $event = $lesson->schedule($fireAt, $fireUntil, $duration, [
            'teacher_id' => $teacherId,
            'audience_id' => $audienceId,
            'onetime' => $validated['onetime'] ? 1 : 0,
            'title' => $validated['title'],
            'type' => ScheduledEvent::TYPE_NORMAL,
            'group_id' => $groupId,
            'offset' => $offset
        ]);


        $endDate = null;
        if (!$onetime) {
            $endDate = Carbon::createFromFormat('Y-m-d', $fireAt->year . '-' . env('LAST_DATE_STUDY'));
            if ($endDate->lte($fireAt)) {
                $endDate->addYear(1);
            }
        }

        $event->validateFreeTime($endDate);

        $event->validateTotalTime();
        $events[] = $event;
        //$event->save();
        //$originId = $event->original_id;
        // need to reepeat event for selected day week during some period
        if (!$onetime) {
            $startDate = $fireAt->clone()->addDays(7);
            $dateRange = CarbonPeriod::since($startDate)->days(7)->until($endDate);

            foreach ($dateRange as $date) {
                $newEvent = $event->replicate();
                $newEvent->fire_at = $newEvent->fire_until = $date;
                $newEvent->end_at = $date->clone()->addMinutes($newEvent->duration);
                $newEvent->validateTotalTime();
                $events[] = $newEvent;
            }
        }

        foreach ($events as $event){
            $event->save();
        }

        $_event = ScheduledEvent::query()
            ->select('scheduled_events.*')
            ->where('scheduled_events.id', $event->id)
            ->joinLesson()
            ->first();

        $_event->lesson_duration_left = number_format($event->lesson->duration_left / 45, 2);
        $_event->duration_left = $event->lesson->duration_left;

        return $_event;
    }

    public function updateEvent(School $school, UpdateEventRequest $request)
    {
        $initialDuration = 0;
        $data = $request->only(['hour', 'minute', 'offset', 'onetime', 'teacher_id', 'duration']);
        $dayOfWeek = $request->query->getInt('day_of_week');
        $workFrom = $school->schedule[$dayOfWeek]['from'] ?? 0;

        $data['hour'] += $workFrom;

        $eventId = $request->query->getInt('event_id');
        /** @var ScheduledEvent $event */
        $event = ScheduledEvent::find($eventId);
        $initialDuration = (int)($event->duration * 100);
        $newDuration = (int)($request->get('duration') * 100);
        $diff = $initialDuration - $newDuration;

        $event->fire_at = $event->fire_at->setTime($data['hour'], $data['minute']);

        unset($data['hour']);
        unset($data['minute']);

        foreach ($data as $key => $value) {
            $event->{$key} = $value;
        }

        $event->validateFreeTime(null, $eventId);

        $event->save();

        $_event = ScheduledEvent::query()
            ->select('scheduled_events.*')
            ->where('scheduled_events.id', $event->id)
            ->joinLesson()
            ->withTime()
            ->first();

        $_event->hour -= $workFrom;

        $lesson = Lesson::query()
            ->where('lessons.id', $_event->lesson_id)
            ->select('lessons.*')
            ->joinGroup()
            ->joinSubgroup()
            ->joinStudent()
            ->joinTeacher()
            ->joinSubject()
            ->first();


        $tempNew = (int)($lesson->duration_left * 100);
        $tempNew += $diff;

//        $lesson->duration_left = $tempNew / 100;
        $lesson->save();

        return [
            'lesson' => $lesson,
            'event' => $_event,
            'html' => view('partials.lesson-ribbon-item', ['lesson' => $lesson])->render()
        ];
    }

    public function clearToday(School $school)
    {
        $isRange = request()->get('range', '0') === '1';

        if ($isRange) {
            $start = request()->get('start');
            $end = request()->get('end');

            $start = Carbon::createFromFormat('d.m.Y', $start);
            $end = Carbon::createFromFormat('d.m.Y', $end);

            ScheduledEvent::whereBetween('fire_at', [$start->startOfDay(), $end->endOfDay()])->update([
                'type' => ScheduledEvent::TYPE_CANCELED
            ]);
        } else {
            $day = request()->query->get('day', today()->format('d.m.Y'));
            $start = Carbon::parse($day)->startOfDay();
            $end = $start->clone()->endOfDay();
            ScheduledEvent::whereBetween('fire_at', [$start, $end])->update([
                'type' => ScheduledEvent::TYPE_CANCELED
            ]);
        }

        return response()->json([], 204);
    }

//    public function clearToday(School $school)
//    {
//        $isRange = request()->get('range', '0') === '1';
//
//        if ($isRange) {
//            $start = request()->get('start');
//            $end = request()->get('end');
//
//            $start = Carbon::createFromFormat('d.m.Y', $start);
//            $end = Carbon::createFromFormat('d.m.Y', $end);
//
//            for (; $start <= $end; $start->addDay()) {
//                ScheduledEvent::query()
//                    ->atDay($start)
//                    ->get()
//                    ->each(function (ScheduledEvent $event) use ($start) {
//                        $event->skipAt($start);
//                        $newEvent = $event->replicate();
//                        $newEvent->onetime = true;
//                        $newEvent->type = ScheduledEvent::TYPE_CANCELED;
//                        $newEvent->fire_at = $newEvent->fire_at->setDate($start->year, $start->month, $start->day);
//                        $newEvent->save();
//                    });
//            }
//        } else {
//            $day = request()->query->get('day', today()->format('d.m.Y'));
//            $day = Carbon::parse($day);
//            $lessonsIds = ScheduledEvent::query()
//                ->atDay($day)
//                ->get()
//                ->each(function (ScheduledEvent $event) use ($day) {
//                    $newEvent = $event->replicate();
//                    $newEvent->onetime = true;
//                    $newEvent->type = ScheduledEvent::TYPE_CANCELED;
//                    $newEvent->fire_at = $newEvent->fire_at->setDate($day->year, $day->month, $day->day);
//                    $newEvent->save();
//                    $event->skipAt($day);
//                });
//        }
//
//        return response()->json([], 204);
//    }

//    public function deleteEvent(School $school)
//    {
//        $eventId = request()->query->get('event_id', null);
//        $isWithMoved = request()->query->getBoolean('with_moved', false);
//        /** @var ScheduledEvent $event */
//        $event = ScheduledEvent::findOrFail($eventId);
//        $lessonId = $event->lesson_id;
//        $originalId = $event->original_id;
//        $eventId = $event->id;
//
//        if ($originalId === null) {
//            $originalId = $eventId;
//        }
//        $isFuture = false;
//
//        if ($isWithMoved && $originalId !== null) {
//            $event = ScheduledEvent::find($originalId);
//            $items = ScheduledEvent::where('original_id', $originalId)->future()->get();
////            $addToLesson = $items
////                ->filter(function (ScheduledEvent $item) use ($event) {
////                    return $item->duration > $event->duration;
////                })
////                ->map(function (ScheduledEvent $item) use ($event) {
////                    return $item->duration - $event->duration;
////                })
////                ->sum();
//
////            $event->lesson->duration_left += $addToLesson;
//            $event->lesson->save();
//
//            if ($event !== null && $event->isFuture()) {
//                $isFuture = true;
//                if ($event->event_type === 'one-time') {
//                    $_event = $school->subGroups->where('id', $event->subgroup_id)->first();
//
//                    $_event->is_expired = false;
//                    $_event->save();
//                    $event->delete();
//                    $lesson = $school->subGroups()->select("sub_groups.*")
//                        ->orderBy('sub_groups.school_id')
//                        ->orderBy('sub_groups.name', 'asc')
//                        ->where('sub_groups.school_id', $school->id)
//                        ->where('id', $_event->id)->first();
//
//                    $html = view('partials.lesson-ribbon-event', ['event' => $lesson])->render();
//                } else {
//                    $event->delete();
//                    $items->each(function (ScheduledEvent $event) {
//                        $event->delete();
//                    });
////                    $event->lesson->duration_left += $event->duration;
////                    if ($event->lesson->duration_left > $event->lesson->duration) {
////                        $event->lesson->duration_left = $event->lesson->duration;
////                    }
//                    $event->lesson->save();
//
//                    $lesson = Lesson::query()
//                        ->where('lessons.id', $lessonId)
//                        ->select('lessons.*')
//                        ->joinGroup()
//                        ->joinSubgroup()
//                        ->joinStudent()
//                        ->joinTeacher()
//                        ->joinSubject()
//                        ->first();
//                    $html = view('partials.lesson-ribbon-item', ['lesson' => $lesson])->render();
//                }
//            } else {
//                foreach ($items as $item) {
//                    $item->delete();
//                }
//                if ($event->event_type === 'one-time') {
//                    $_event = $school->subGroups->where('id', $event->subgroup_id)->first();
//                    $_event->is_expired = false;
//                    $_event->save();
//                    $event->delete();
//                    $lesson = $school->subGroups()->select("sub_groups.*")
//                        ->orderBy('sub_groups.school_id')
//                        ->orderBy('sub_groups.name', 'asc')
//                        ->where('sub_groups.school_id', $school->id)
//                        ->where('id', $_event->id)->first();
//
//                    $html = view('partials.lesson-ribbon-event', ['event' => $lesson])->render();
//                } else {
//                    $isFuture = $event->cancel();
//                }
//            }
//        } else {
//            if ($event->event_type === 'one-time') {
//            } else {
//                $event->updateLessonDuration();
//            }
//            $event->updateLessonDuration();
//            $isInFuture = $event->cancel();
//            $lesson = Lesson::query()
//                ->where('lessons.id', $lessonId)
//                ->select('lessons.*')
//                ->joinGroup()
//                ->joinSubgroup()
//                ->joinStudent()
//                ->joinTeacher()
//                ->joinSubject()
//                ->first();
//            $html = view('partials.lesson-ribbon-item', ['lesson' => $lesson])->render();
//        }
//
//
//        return [
//            'lesson'      => $lesson,
//            'is_future'   => $isFuture,
////            'html'        => $html,
//            'original_id' => $originalId
//        ];
//    }

    public function deleteEvent(School $school)
    {
        $eventId = request()->query->get('event_id', null);
        $all = request()->query->getBoolean('deleteAll', false);
        /** @var ScheduledEvent $event */
        $event = ScheduledEvent::findOrFail($eventId);
        $lesson = $event->lesson;
        $groupId = $event->group_id;
        $event->delete();
        if ($subGroup = $event->lesson->subGroup) {
            $subGroup->is_expired = false;
            $subGroup->save();
        }
        if ($all && $event->group_id !== "0") {
            ScheduledEvent::where('group_id', $groupId)
                ->where('fire_at', '>', now())
                ->delete();
        }

        return [
            'lesson' => $lesson,
            'is_future' => true,
            'original_id' => $eventId
        ];
    }

    public function reactivate(School $school)
    {
        $eventId = request()->query->getInt('event_id', 0);
        $event = ScheduledEvent::find($eventId);
        $event->type = ScheduledEvent::TYPE_NORMAL;
        $event->save();

        return $event;
    }

//    public function skipAt(School $school)
//    {
//        $day = request()->query->get('day', today()->format('d.m.Y'));
//        $eventId = request()->query->get('event_id', null);
//
//        abort_if($eventId === null, 404);
//        ScheduledEventObserver::$ignoreDuration = true;
//
//        $day = Carbon::parse($day);
//        /** @var ScheduledEvent $event */
//        $event = ScheduledEvent::find($eventId);
//        if ($event->onetime) {
//            $event->type = ScheduledEvent::TYPE_CANCELED;
//            $event->save();
//        } else {
//            $newEvent = $event->replicate();
//            $event->skipAt($day);
//            $newEvent->type = ScheduledEvent::TYPE_CANCELED;
//            $newEvent->onetime = true;
//            $newEvent->fire_at = $newEvent->fire_at->setDate($day->year, $day->month, $day->day);
//            $newEvent->original_id = $event->original_id ?? $event->id;
//            $newEvent->save();
//            $event = $newEvent;
//        }
//
//        ScheduledEventObserver::$ignoreDuration = false;
//
//        return [
//            'event' => $event,
//            'html'  => $this->increaseDurationAndRender($event, true)->render()
//        ];
//    }
    public function skipAt(School $school)
    {
        $eventId = request()->query->get('event_id', null);

        abort_if($eventId === null, 404);

        $event = ScheduledEvent::find($eventId);
        $event->type = ScheduledEvent::TYPE_CANCELED;
        $event->save();

        return [
            'event' => $event,
        ];
    }

    public function skipAfter(School $school)
    {
        $day = request()->query->get('day', today()->format('d.m.Y'));
        $eventId = request()->query->get('event_id', null);

        abort_if($eventId === null, 404);

        $day = Carbon::parse($day);
        /** @var ScheduledEvent $event */
        $event = ScheduledEvent::find($eventId);
        $event->fire_until = $day->addDays(-1)->format('Y-m-d');
        $event->save();

        return $this->increaseDurationAndRender($event);
    }

    protected function increaseDurationAndRender(ScheduledEvent $event, bool $isOnetime = false)
    {
        if (!$isOnetime) {
            $lesson = $event->lesson;
//            $lesson->duration_left += $event->duration;
//            if ($lesson->duration_left > $lesson->duration) {
//                $lesson->duration_left = $lesson->duration;
//            }
//            $lesson->save();
        }

        $lesson = Lesson::query()
            ->where('lessons.id', $event->lesson_id)
            ->select('lessons.*')
            ->joinGroup()
            ->joinSubgroup()
            ->joinStudent()
            ->joinTeacher()
            ->joinSubject()
            ->first();

        return view('partials.lesson-ribbon-item', ['lesson' => $lesson]);
    }

    public function moveEvent(School $school)
    {
        $eventId = request()->query->getInt('event_id', 0);
        /** @var ScheduledEvent $event */
        $event = $school->scheduledEvents()->findOrFail($eventId);
        $hour = request()->get('hour', 0);
        $minute = request()->get('minute', 0);
        $audienceId = (int)request()->get('audienceId', 0);
        $onetime = request()->get('onetime', false);
        $day = request()->get('day', today()->format('d.m.Y'));
        $dayOfWeek = request()->get('dayOfWeek', false);
        $fromDate = request()->get('from_date', null);

        $schedule = $school->schedule[$dayOfWeek];
        $from = $schedule['from'] ?? 0;
        //$offset = (int)request()->get('offset', 0);
        $hour += $from;

        $day = Carbon::createFromFormat('d.m.Y', $day);

        $newFireAt = Carbon::parse($event->fire_at);
        $newFireAt = $newFireAt->setHours($hour)
            ->setMinute($minute)
            ->setDate($day->year, $day->month, $day->day);

        $event->fire_at = $newFireAt;
        $event->fire_until = $newFireAt;
        $event->audience_id = $audienceId;
        $event->offset = 0;

        $endDate = null;
        $nextEvents = null;

        if (!$onetime && $event->group_id !== "0") {
            $nextEvents = ScheduledEvent::where('group_id', $event->group_id)
                ->where('id', '!=', $event->id)
                ->where('fire_at', '>=', $day)
                ->get();

            $endDate = $nextEvents->max('fire_at');
        }

        $event->validateFreeTime($endDate);

        $event->save();

        if ($nextEvents) {
            foreach ($nextEvents as $ev) {
                /** @var ScheduledEvent $ev */
                $evFire = $newFireAt->clone()->setDate($ev->fire_at->year, $ev->fire_at->month, $ev->fire_at->day);
                $ev->fire_at = $evFire;
                $ev->fire_until = $evFire;
                $ev->audience_id = $audienceId;
                $ev->offset = 0;
                $ev->save();
            }
        }

        return response()->json($event, 200);
    }

    private function mapGroupNameWithCount(Group $group): Group
    {
        $group->name_with_count = __('app.group.extra.name_with_count', [
            'full_name' => $group->full_name,
            'count' => $group->studentsCount()
        ]);

        return $group;
    }
}
